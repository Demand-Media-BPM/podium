import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Chip, FormControlLabel, LinearProgress, Paper, Typography } from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WelcomeModal from '../components/client/WelcomeModal.jsx';
import VideoRecorder from '../components/client/VideoRecorder.jsx';
import RecordingReview from '../components/client/RecordingReview.jsx';
import { useRecorderController, useRecorderValue, select } from '../hooks/useRecorder.js';
import { createSession, runSubmission } from '../services/submissionFlow.js';
import { initiateUpload, uploadToS3, completeUpload, submitLocalResponse, finalizeSubmission } from '../services/responseApi.js';
import { createSubmissionId } from '../utils/clientForm.js';
import { describeSubmitError } from '../utils/submitError.js';
import { extensionForMime } from '../utils/mediaSupport.js';
import { formatClock } from '../utils/format.js';
import { markSubmissionDone } from '../utils/thankYou.js';
import { CONSENT_TEXT } from '../constants.js';

const network = {initiateUpload, uploadToS3, completeUpload, submitLocalResponse};
function newBatchToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
export default function QuestionnaireJourney({token, request}) {
  const navigate = useNavigate();
  const controller = useRecorderController();
  const status = useRecorderValue(controller, select.status);
  const elapsed = useRecorderValue(controller, select.elapsedSeconds);
  const blob = useRecorderValue(controller, select.blob);
  const duration = useRecorderValue(controller, select.durationSeconds);
  const mimeType = useRecorderValue(controller, select.mimeType);
  const notice = useRecorderValue(controller, select.notice);
  const questions = useMemo(() => request.questions || [{id:'legacy',text:request.question}], [request]);
  const [details, setDetails] = useState(null);
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [answers, setAnswers] = useState({});
  const [expanded, setExpanded] = useState(questions[0].id);
  const [active, setActive] = useState(questions[0].id);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const batch = useRef(null);
  const abortRef = useRef(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const sessions = useRef({});

  useEffect(() => { mounted.current = true; return () => {mounted.current = false; abortRef.current?.abort();}; }, []);
  useEffect(() => {
    if (status === 'recorded' && blob) {
      setAnswers(prev => prev[active]?.blob === blob ? prev : {...prev, [active]: {blob, durationSeconds:duration, mimeType, notice}});
    }
  }, [status, blob, duration, mimeType, notice, active]);
  const used = Object.values(answers).reduce((sum,a) => sum + a.durationSeconds, 0);
  const live = status === 'recording' ? elapsed : 0;
  const remaining = Math.max(0, request.maxDurationSeconds - used - live);
  const complete = questions.every(q => Boolean(answers[q.id]?.blob));
  const recording = status === 'recording' || status === 'requesting';
  const switchQuestion = (id, open) => {
    if (sending || recording) return;
    if (id !== active || !open) controller.release();
    if (id !== active) setActive(id);
    setExpanded(open ? id : false);
    const others = Object.entries(answers).filter(([key])=>key!==id).reduce((sum,[,a])=>sum+a.durationSeconds,0);
    controller.setMaxSeconds(Math.max(0, request.maxDurationSeconds - others));
  };
  useEffect(() => {
    if (status !== 'recording') controller.setMaxSeconds(Math.max(0, request.maxDurationSeconds - Object.entries(answers).filter(([key])=>key!==active).reduce((sum,[,a])=>sum+a.durationSeconds,0)));
  }, [active, answers, controller, request.maxDurationSeconds, status]);
  const retake = id => {
    if (sending) return;
    // A previous final confirmation may have been lost. A retake starts a new immutable answer set.
    sessions.current = {};
    batch.current = null;
    setAnswers(prev => {const next={...prev};delete next[id];return next;});
    setConsent(false);setError('');controller.release();
    controller.requestAccess();
  };
  const submit = async () => {
    if (lock.current || !complete || !consent || recording) return;
    lock.current=true;setSending(true);setError('');setProgress(0);
    if (!batch.current) batch.current={id:createSubmissionId(),token:newBatchToken()};
    const abort = new AbortController();abortRef.current=abort;
    try {
      for (let i=0;i<questions.length;i++) {
        const q=questions[i], answer=answers[q.id];
        if (!sessions.current[q.id]) sessions.current[q.id]=createSession(createSubmissionId());
        const session=sessions.current[q.id];
        if (!session.confirmed) {
          try {
            await runSubmission({token, session, deps:network, signal:abort.signal,
              input:{...answer, ...details, consent, filename:'response.'+extensionForMime(answer.mimeType), ...(request.multiQuestion ? {batchId:batch.current.id,batchToken:batch.current.token,questionId:q.id}: {})},
              onProgress:value => mounted.current && setProgress(((i+value/100)/questions.length)*97)});
            session.confirmed=true;
          } catch(err) {
            if (describeSubmitError(err).restart) delete sessions.current[q.id];
            throw err;
          }
        }
      }
      if (request.multiQuestion) await finalizeSubmission(token,{batchId:batch.current.id,batchToken:batch.current.token,answers:questions.map(q=>sessions.current[q.id].responseId)},{signal:abort.signal});
      markSubmissionDone();
      if (mounted.current) {setProgress(100);navigate('/thank-you',{replace:true});}
    } catch(err) {
      if (mounted.current) setError(err.response?.data?.message || describeSubmitError(err).message);
    } finally {
      lock.current=false;abortRef.current=null;if(mounted.current)setSending(false);
    }
  };
  return <Box sx={{display:'grid',gap:2.5}}>
    <WelcomeModal open={welcomeOpen} title={request.title} maxDurationSeconds={request.maxDurationSeconds} initialValues={details || {name:request.clientName || '',email:''}} onContinue={values=>{if(details && (values.name!==details.name || values.email!==details.email)){sessions.current={};batch.current=null;}setDetails(values);setWelcomeOpen(false);}} />
    <Box>{details && <Button size="small" onClick={()=>setWelcomeOpen(true)} disabled={sending || recording}>Edit name or email</Button>}<Typography variant="h4" component="h1">{request.title}</Typography><Typography color="text.secondary">Record a separate answer for every question. Review or re-record before submitting.</Typography></Box>
    <Paper variant="outlined" sx={{p:2.5,display:'flex',gap:2,justifyContent:'space-between',flexWrap:'wrap',borderLeft:5,borderLeftColor:'secondary.main'}}>
      <Box><Typography variant="overline">Recording time remaining</Typography><Typography variant="h4" role="timer" sx={{fontVariantNumeric:'tabular-nums'}}>{formatClock(Math.ceil(remaining))} <Typography component="span" color="text.secondary">/ {formatClock(request.maxDurationSeconds)}</Typography></Typography></Box>
      <Box sx={{alignSelf:'center'}}><Chip label={Object.keys(answers).length+' / '+questions.length+' answered'} /><Typography variant="caption" display="block" sx={{mt:1}}>Only recording time counts. Re-recording restores the time used by that answer.</Typography></Box>
    </Paper>
    {questions.map((q,index) => <Accordion key={q.id} expanded={expanded===q.id} onChange={(_,open)=>switchQuestion(q.id,open)} disabled={sending || (recording && active!==q.id)} disableGutters sx={{borderRadius:'16px !important',overflow:'hidden'}}>
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} aria-controls={'answer-'+q.id} id={'question-'+q.id}>
        <Box sx={{display:'flex',gap:1.5,alignItems:'center',py:1,width:'100%',minWidth:0}}>
          <Chip size="small" label={index+1} /><Typography sx={{flex:1,overflowWrap:'anywhere',whiteSpace:'pre-wrap',fontWeight:600}}>{q.text}</Typography>
          {answers[q.id] && <CheckCircleRoundedIcon color="success" aria-label="Answer recorded" />}
        </Box>
      </AccordionSummary>
      <AccordionDetails id={'answer-'+q.id} sx={{p:{xs:2,sm:3},borderTop:1,borderColor:'divider'}}>
        {expanded===q.id && <Box sx={{display:'grid',gap:3,gridTemplateColumns:{xs:'1fr',md:'2fr 3fr'}}}>
          <Box><Typography variant="overline">Question {index+1}</Typography><Typography variant="h6" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',mb:2}}>{q.text}</Typography><Typography variant="subtitle2" sx={{mb:1}}>Tips for a Good Recording</Typography>
            <Box component="ol" sx={{m:0,pl:2.5,color:'text.secondary','& > li':{mb:1.5}}}>
              <Typography component="li" variant="body2">Choose a quiet spot with the light in front of you, not behind you.</Typography>
              <Typography component="li" variant="body2">Look at the camera, not at the question on the screen.</Typography>
              <Typography component="li" variant="body2">Use real examples from your own work wherever possible.</Typography>
              <Typography component="li" variant="body2">Don't worry about getting it perfect on the first attempt. You can retake any answer you are not happy with.</Typography>
            </Box></Box>
          <Box sx={{minWidth:0,pointerEvents:details?'auto':'none',opacity:details?1:0.5}}>
            {answers[q.id] ? <RecordingReview {...answers[q.id]} onRerecord={()=>retake(q.id)} onContinue={()=>{const next=questions.find(item=>!answers[item.id]);if(next)switchQuestion(next.id,true);else setExpanded(false);}} /> : remaining<=0 && status!=='recording' ? <Alert severity="warning">No recording time remains. Re-record another answer with a shorter video to free time for this question.</Alert> : <VideoRecorder controller={controller} />}
          </Box>
        </Box>}
      </AccordionDetails>
    </Accordion>)}
    <Paper variant="outlined" sx={{p:3,display:'grid',gap:2}}>
      <FormControlLabel control={<Checkbox checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={!complete || sending} />} label={CONSENT_TEXT} />
      {!complete && <Typography color="text.secondary">Record an answer for every question to enable submission.</Typography>}
      {error && <Alert severity="error">{error} Your recordings are kept here for retry.</Alert>}
      {sending && <Box><LinearProgress variant="determinate" value={progress}/><Typography variant="body2" sx={{mt:1}}>Uploading and saving answers... {Math.round(progress)}%</Typography></Box>}
      <Box sx={{display:'flex',gap:2}}><Button variant="contained" size="large" onClick={submit} disabled={!complete || !consent || sending || recording}> {sending?'Submitting...':'Submit all answers'}</Button>{sending && <Button onClick={()=>abortRef.current?.abort()}>Cancel upload</Button>}</Box>
    </Paper>
  </Box>;
}
