import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Pagination, Paper, Typography } from '@mui/material';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import PageHeader from '../components/ui/PageHeader.jsx';
import LoadingSkeleton from '../components/ui/LoadingSkeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import UserDialog from '../components/users/UserDialog.jsx';
import { useToast } from '../components/ui/ToastProvider.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { listUsers, createUser, updateUser } from '../services/userApi.js';
import { getApiError } from '../utils/format.js';
import { getInitials } from '../utils/people.js';
import { tokens } from '../tokens.js';

export default function ManageUsersPage() {
  const {user, refreshUser} = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [state, setState] = useState({status:'loading',users:[],pagination:null,error:''});
  const [dialog, setDialog] = useState(null);
  const [changing, setChanging] = useState(false);
  const actionLock = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setState(prev => ({...prev,status:'loading',error:''}));
    try {
      const result = await listUsers({page});
      if(ticket !== generation.current) return;
      if(page > result.pagination.totalPages) {setPage(result.pagination.totalPages);return;}
      setState({status:'ready',users:result.users,pagination:result.pagination,error:''});
    } catch(err) {
      if(ticket === generation.current) setState(prev=>({...prev,status:'error',error:getApiError(err,'Could not load users.').message}));
    }
  },[page]);
  useEffect(()=>{load();return ()=>{generation.current += 1;};},[load]);
  const save = async values => {
    const account = dialog.account;
    const saved = account ? await updateUser(account.id,values) : await createUser(values);
    setDialog(null);
    toast.success(account ? 'Account updated.' : 'User created. They can now sign in.');
    if(saved.id === user.id) await refreshUser().catch(()=>{});
    if(!account && page !== 1) setPage(1); else await load();
  };
  const toggleStatus = async () => {
    if(actionLock.current) return;
    actionLock.current=true;setChanging(true);
    try {
      await updateUser(dialog.account.id,{isActive:!dialog.account.isActive});
      toast.success(dialog.account.isActive ? 'Account deactivated.' : 'Account activated.');
      setDialog(null);await load();
    } catch(err) {toast.error(getApiError(err,'Could not change account status.').message);}
    finally {actionLock.current=false;setChanging(false);}
  };
  return <>
    <PageHeader title="Manage Users" description="Create accounts and manage who can access PODIUM." actions={<Button variant="contained" startIcon={<PersonAddRoundedIcon />} onClick={()=>setDialog({type:'edit',account:null})}>Add user</Button>} />
    <Alert severity="info" sx={{mb:3}}>Admins can manage all requests, responses and accounts. Users can access only their own requests and responses.</Alert>
    {state.error && <Alert severity="error" sx={{mb:2}} action={<Button color="inherit" onClick={load}>Try again</Button>}>{state.error}</Alert>}
    {state.status==='loading' && !state.users.length && <LoadingSkeleton variant="rows" count={3} label="Loading users" />}
    {state.status==='ready' && !state.users.length && <EmptyState icon={<PeopleRoundedIcon />} title="No users found" description="Add an account to get started." />}
    <Box component="ul" aria-label="User accounts" aria-busy={state.status==='loading'} sx={{m:0,p:0,display:'grid',gap:1.5,opacity:state.status==='loading'?0.6:1}}>
      {state.users.map(account=><Paper component="li" key={account.id} variant="outlined" sx={{listStyle:'none',p:{xs:2,sm:2.5},boxShadow:tokens.shadow.card}}>
        <Box sx={{display:'flex',gap:2,alignItems:{sm:'center'},justifyContent:'space-between',flexDirection:{xs:'column',sm:'row'}}}>
          <Box sx={{display:'flex',gap:1.5,alignItems:'center',minWidth:0}}>
            <Avatar sx={{bgcolor:'primary.light',color:'primary.main'}}>{getInitials(account.name)}</Avatar>
            <Box sx={{minWidth:0}}><Typography fontWeight={700} sx={{overflowWrap:'anywhere'}}>{account.name}{account.id===user.id ? ' (you)' : ''}</Typography><Typography variant="body2" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{account.email}</Typography>
              <Box sx={{display:'flex',gap:1,mt:1}}><Chip size="small" label={account.role==='admin'?'Admin':'User'} color={account.role==='admin'?'primary':'default'} variant="outlined" /><Chip size="small" label={account.isActive?'Active':'Inactive'} color={account.isActive?'success':'default'} /></Box>
            </Box>
          </Box>
          <Box sx={{display:'flex',gap:1,flexWrap:'wrap',flexShrink:0}}>
            <Button variant="outlined" color="inherit" startIcon={<EditRoundedIcon />} onClick={()=>setDialog({type:'edit',account})} disabled={state.status==='loading'} aria-label={'Edit '+account.name}>Edit</Button>
            <Button color={account.isActive?'warning':'success'} onClick={()=>setDialog({type:'status',account})} disabled={account.id===user.id || state.status==='loading'} aria-label={(account.isActive?'Deactivate ':'Activate ')+account.name}>{account.isActive?'Deactivate':'Activate'}</Button>
          </Box>
        </Box>
      </Paper>)}
    </Box>
    {state.pagination && state.pagination.totalPages>1 && <Box sx={{display:'flex',justifyContent:'center',mt:3}}><Pagination page={page} count={state.pagination.totalPages} onChange={(_,value)=>setPage(value)} disabled={state.status==='loading'} color="primary" /></Box>}
    {state.pagination && <Typography variant="caption" color="text.secondary" sx={{display:'block',mt:2}}>{state.pagination.total} account{state.pagination.total===1?'':'s'}</Typography>}
    {dialog?.type==='edit' && <UserDialog account={dialog.account} currentUserId={user.id} onSave={save} onClose={()=>setDialog(null)} />}
    {dialog?.type==='status' && <ConfirmDialog open title={dialog.account.isActive?'Deactivate this account?':'Activate this account?'} confirmLabel={dialog.account.isActive?'Deactivate':'Activate'} confirmColor={dialog.account.isActive?'warning':'primary'} busy={changing} onCancel={()=>setDialog(null)} onConfirm={toggleStatus}>
      <strong>{dialog.account.name}</strong>{dialog.account.isActive ? ' will no longer be able to sign in or use an existing session. Their requests and videos will be kept.' : ' will be able to sign in again with their existing credentials.'}
    </ConfirmDialog>}
  </>;
}
