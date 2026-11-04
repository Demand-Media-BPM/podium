// Loading this file registers every model with Mongoose (needed so indexes are built on startup).
const User = require('./User');
const Request = require('./Request');
const Response = require('./Response');
const JobLock = require('./JobLock');
const Submission = require('./Submission');
const IssuedLink = require('./IssuedLink');

module.exports = { User, Request, Response, JobLock, Submission, IssuedLink };
