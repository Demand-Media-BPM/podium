const crypto = require('crypto');
const AppError = require('../utils/AppError');
const { validateQuestion, cleanText } = require('./fieldValidators');

const MICROSITES = ['it-tech-pulse', 'fin-tech-pulse', 'mar-tech-pulse', 'hr-tech-pulse', 'health-tech-pulse'];
const MAX_QUESTIONS = 30;
const TOTAL_SECONDS = 59 * 60;
const validBatch = (id, token) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const questionsOf = (request) => request.questions?.length ? request.questions.map((q) => ({ id: String(q._id || q.id), text: q.text })) : [{ id: 'legacy', text: request.question }];

function validateQuestionnaire(body, { partial = false } = {}) {
  const data = {};
  const errors = {};
  if (!partial || body.clientName !== undefined) {
    const name = typeof body.clientName === 'string' ? cleanText(body.clientName, { singleLine: true }) : '';
    if (!name || name.length > 100) errors.clientName = 'Enter a client name of up to 100 characters';
    else data.clientName = name;
  }
  if (!partial || body.microsite !== undefined) {
    if (!MICROSITES.includes(body.microsite)) errors.microsite = 'Select a microsite';
    else data.microsite = body.microsite;
  }
  if (!partial || body.questions !== undefined) {
    if (!Array.isArray(body.questions) || !body.questions.length || body.questions.length > MAX_QUESTIONS) {
      errors.questions = `Add between 1 and ${MAX_QUESTIONS} questions`;
    } else {
      data.questions = body.questions.map((q) => {
        const result = validateQuestion(typeof q === 'string' ? q : q?.text);
        if (result.error) errors.questions = result.error;
        const id = typeof q === 'object' && q?.id;
        if (id && !/^[a-f0-9]{24}$/.test(id)) errors.questions = 'Invalid question id';
        return { ...(id ? { _id: id } : {}), text: result.value };
      });
      const ids = data.questions.filter((q) => q._id).map((q) => q._id);
      if (new Set(ids).size !== ids.length) errors.questions = 'Question ids must be unique';
      data.question = data.questions[0]?.text;
    }
  }
  if (Object.keys(errors).length) throw new AppError(400, 'Please correct the highlighted fields', 'VALIDATION_ERROR', errors);
  return data;
}

function validateAnswerContext(request, fields) {
  if (!request.questions?.length) return fields;
  const question = questionsOf(request).find((q) => q.id === fields.questionId);
  if (!question || !validBatch(fields.batchId, fields.batchToken)) {
    throw new AppError(400, 'Invalid question or submission', 'VALIDATION_ERROR');
  }
  return { ...fields, questionText: question.text, batchTokenHash: digest(fields.batchToken) };
}

module.exports = { MICROSITES, MAX_QUESTIONS, TOTAL_SECONDS, validBatch, digest, questionsOf, validateQuestionnaire, validateAnswerContext };
