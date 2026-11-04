// Client-side search over requests that are already loaded. The API has no search endpoint, so this only
// covers the requests on the current page; the UI says so when there is more than one page.
export function filterRequests(requests, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return requests;
  return requests.filter((request) =>
    [request.title, request.question, request.createdBy && request.createdBy.name].some((value) =>
      String(value || '').toLowerCase().includes(needle)
    )
  );
}
