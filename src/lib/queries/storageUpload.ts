import { supabase } from '../supabase';

/** A plain request rather than the Supabase client, which reports no upload progress. */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
  upsert = true,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');

  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    request.setRequestHeader('apikey', process.env.REACT_APP_SUPABASE_ANON_KEY as string);
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.setRequestHeader('x-upsert', String(upsert));
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Upload failed (${request.status})`)));
    request.onerror = () => reject(new Error('Upload failed'));
    request.send(file);
  });
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
