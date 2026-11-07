'use client';
// A password field with a show/hide button (same markup the old app added to every password field).
import { useRef, useState } from 'react';

const Eye = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const EyeOff = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;

export default function PwInput(props) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  return (
    <div className="pw">
      <input {...props} ref={ref} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => { setShow(!show); ref.current?.focus(); }}>{show ? <EyeOff /> : <Eye />}</button>
    </div>
  );
}
