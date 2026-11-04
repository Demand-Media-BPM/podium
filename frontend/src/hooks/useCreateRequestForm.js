import { useRef, useState } from 'react';
import { createRequest } from '../services/requestApi.js';
import { getApiError, localInputToIso } from '../utils/format.js';
import { EMPTY_FORM, validateForm } from '../utils/requestForm.js';

export default function useCreateRequestForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null); // { request, url }
  const inFlight = useRef(false); // blocks double-clicks before React re-renders

  const setField = (name) => (event) => {
    setForm((current) => ({ ...current, [name]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;

    const errors = validateForm(form);
    setFieldErrors(errors);
    setFormError('');
    if (Object.keys(errors).length > 0) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      const payload = { title: form.title, clientName: form.clientName, microsite: form.microsite, questions: form.questions };
      const expiresAt = localInputToIso(form.expiresAt);
      if (expiresAt) payload.expiresAt = expiresAt;
      setCreated(await createRequest(payload));
    } catch (err) {
      const { message, fieldErrors: serverErrors } = getApiError(err, 'Could not create the request. Please try again.');
      setFieldErrors(serverErrors);
      setFormError(message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const reset = () => {
    setCreated(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  };

  return { form, setField, fieldErrors, formError, submitting, created, submit, reset };
}
