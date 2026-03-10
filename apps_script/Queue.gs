function Queue_enqueue(jobType, payload) {
  return { ok: false, error: 'Not implemented', jobType: jobType, payload: payload };
}

function Queue_processReadyJobs() {
  // TODO: claim and process queued jobs.
}
