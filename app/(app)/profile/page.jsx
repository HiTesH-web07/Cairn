'use client';
// My profile: picture or avatar, name and phone, and password.
import { useState } from 'react';
import { useApp } from '@/components/AppState';
import { Avatar, Head, PresetAvatar, PRESET_COUNT } from '@/components/ui';
import PwInput from '@/components/profile/PwInput';
import { api } from '@/lib/client';

export default function ProfilePage() {
  const { me, loadMe, toast } = useApp();
  const u = me.user;
  const [picMsg, setPicMsg] = useState('JPEG, PNG or WebP. It is cropped to a square.');
  const [berr, setBerr] = useState('');
  const [perr, setPerr] = useState('');

  const save = async (patch, okMsg) => { await api('PATCH', '/api/profile', patch); await loadMe(); toast(okMsg); };

  const onPic = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (f.size > 8 * 1024 * 1024) throw new Error('That picture is too large. Pick one under 8 MB.');
      const bmp = await createImageBitmap(f);
      const side = Math.min(bmp.width, bmp.height); const c = document.createElement('canvas'); c.width = c.height = 192;
      c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 192, 192);
      let q = 0.85; let data = c.toDataURL('image/jpeg', q);
      while (data.length > 80000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
      setPicMsg('Saving…');
      await save({ avatar: data }, 'Picture saved');
      setPicMsg('JPEG, PNG or WebP. It is cropped to a square.');
    } catch (err) { setPicMsg(err.message || 'That file could not be read as a picture.'); }
    e.target.value = '';
  };
  const onBasics = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await save({ name: fd.name, phone: fd.phone }, 'Saved'); setBerr(''); } catch (err) { setBerr(err.message); }
  };
  const onPw = async (e) => {
    e.preventDefault(); const form = e.currentTarget; const fd = Object.fromEntries(new FormData(form).entries());
    try {
      if (fd.password !== fd.again) throw new Error('The two new passwords are not the same');
      await api('POST', '/api/profile/password', { current: fd.current, password: fd.password });
      toast('Password changed'); form.reset(); setPerr('');
    } catch (err) { setPerr(err.message); }
  };

  return (
    <>
      <Head eyebrow="Account" title="My profile" sub="Your picture, your details and your password." />
      <div className="prof">
        <section className="card sect"><h3>Picture</h3><p className="small muted">A photo or an avatar shows beside your name for your team. Your initial is used if you pick nothing.</p>
          <div className="pic-row"><div id="picPrev"><Avatar name={u.name} size="xl" pic={u.avatar} /></div>
            <div className="pic-actions"><label className="btn primary filebtn">Upload a photo<input type="file" id="picFile" accept="image/png,image/jpeg,image/webp" hidden onChange={onPic} /></label>
              <button type="button" id="picRemove" disabled={!u.avatar} onClick={() => save({ avatar: null }, 'Using your initial').catch((e) => toast(e.message))}>Use my initial</button><p className="small muted" id="picMsg">{picMsg}</p></div></div>
          <h4 className="sub">Or pick an avatar</h4>
          <div className="presets" role="group" aria-label="Avatars">
            {Array.from({ length: PRESET_COUNT }, (_, i) => {
              const on = u.avatar === `preset:${i}`;
              return <button key={i} type="button" className={`preset-btn${on ? ' on' : ''}`} aria-label={`Avatar ${i + 1}`} aria-pressed={on} onClick={() => save({ avatar: `preset:${i}` }, 'Avatar saved').catch((e) => toast(e.message))}><PresetAvatar i={i} size="lg" /></button>;
            })}
          </div>
        </section>
        <form className="card sect" id="basics" onSubmit={onBasics} key={`b-${u.name}-${u.phone}`}><h3>Basics</h3><p className="small muted">Your name and phone show to people in your workspace. Role, level and team are set by your admin or manager.</p>
          <div className="inline"><div><label>Name</label><input name="name" defaultValue={u.name} required maxLength={120} autoComplete="name" /></div>
            <div><label>Phone (optional)</label><input name="phone" defaultValue={u.phone || ''} placeholder="+91 98765 43210" autoComplete="tel" /></div></div>
          <div className="inline"><div><label>Email</label><input value={u.email} readOnly /></div><div><label>Role</label><input value={[u.role, u.level, u.department].filter(Boolean).join(' · ')} readOnly /></div></div>
          <p className="err" id="berr">{berr}</p><button className="primary">Save changes</button></form>
        <form className="card sect" id="pwform" onSubmit={onPw}><h3>Change password</h3><p className="small muted">You will stay signed in here. Other devices are signed out.</p>
          <label>Current password</label><PwInput name="current" required autoComplete="current-password" />
          <label>New password (10+ characters)</label><PwInput name="password" minLength={10} required autoComplete="new-password" />
          <label>Type the new one again</label><PwInput name="again" minLength={10} required autoComplete="new-password" />
          <p className="err" id="perr">{perr}</p><button className="primary">Change password</button></form>
      </div>
    </>
  );
}
