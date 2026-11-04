import { useEffect, useState } from 'react';

// Creates an object URL for a Blob (used for the recording preview) and revokes it when the blob changes
// or the component unmounts, so old recordings are not kept in memory.
export default function useObjectUrl(blob) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!blob) {
      setUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
