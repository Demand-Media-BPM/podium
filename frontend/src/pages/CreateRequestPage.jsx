import { Paper } from '@mui/material';
import PageHeader from '../components/ui/PageHeader.jsx';
import CreateRequestForm from '../components/requests/CreateRequestForm.jsx';
import CreateRequestSuccess from '../components/requests/CreateRequestSuccess.jsx';
import useCreateRequestForm from '../hooks/useCreateRequestForm.js';
import { enter } from '../styles/motion.js';
import { tokens } from '../tokens.js';

export default function CreateRequestPage() {
  const { form, setField, fieldErrors, formError, submitting, created, submit, reset } = useCreateRequestForm();

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Create request' }]}
        title={created ? 'Request created' : 'Create a request'}
        description={
          created
            ? 'Copy the link now. It cannot be shown again.'
            : 'Add the questions for your client. We generate a private link they can use to answer on video.'
        }
      />
      <div style={{ maxWidth: 760 }}>
        {created ? (
          <CreateRequestSuccess created={created} onCreateAnother={reset} />
        ) : (
          <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, boxShadow: tokens.shadow.card, animation: enter(40) }}>
            <CreateRequestForm
              form={form}
              setField={setField}
              fieldErrors={fieldErrors}
              formError={formError}
              submitting={submitting}
              onSubmit={submit}
            />
          </Paper>
        )}
      </div>
    </>
  );
}
