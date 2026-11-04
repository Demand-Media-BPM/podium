import { useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx';
import UnavailableLink from '../components/client/UnavailableLink.jsx';
import usePublicRequest from '../hooks/usePublicRequest.js';
import QuestionnaireJourney from './QuestionnaireJourney.jsx';
export default function ClientResponsePage() {
  const {token}=useParams();
  const {status,request}=usePublicRequest(token);
  const {setMicrosite}=useOutletContext();
  useEffect(()=>{setMicrosite(request?.microsite || null);},[request?.microsite,setMicrosite]);
  if(status==='loading')return <LoadingSkeleton variant="page" label="Loading your questions"/>;
  if(status!=='ready')return <UnavailableLink kind={status}/>;
  return <QuestionnaireJourney key={token} token={token} request={request}/>;
}
