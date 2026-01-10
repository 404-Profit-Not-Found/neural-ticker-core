/**
 * Gracefully extracts a string error message from any error object or value.
 * Prevents [object Object] in logs by stringifying complex error objects.
 */
export function getErrorMessage(error: any): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;

  // Handle Axios/Nest response errors
  const responseData = error.response?.data;
  if (responseData) {
    if (typeof responseData === 'string') return responseData;
    if (responseData.message) {
      return typeof responseData.message === 'object'
        ? JSON.stringify(responseData.message)
        : responseData.message;
    }
    if (responseData.error) {
       return typeof responseData.error === 'object'
        ? JSON.stringify(responseData.error)
        : responseData.error;
    }
    return JSON.stringify(responseData);
  }

  if (error.message) {
    return typeof error.message === 'object'
      ? JSON.stringify(error.message)
      : error.message;
  }

  // Handle case where error itself has an 'error' property (common in Finnhub client)
  if (error.error) {
    return typeof error.error === 'object'
      ? JSON.stringify(error.error)
      : error.error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
