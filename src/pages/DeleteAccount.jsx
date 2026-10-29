import { useEffect, useState } from 'react';
import { submitPublicRequest } from '../api/deletionRequests';
import { Err, isEmail, useAction } from '../components/ui';
import { Icon, Logo } from '../components/icons';

// Public "Request Account Deletion" page (contract: deletion in-app AND via an external web page; Google Play Data Safety).
// No admin login. The person proves ownership with the account email + password (POST /public/delete-account);
// that files a pending request, which a Full Admin approves in the panel.
// Gujarati wording is a draft: Loyadham to review before release.
const TEXT = {
  en: {
    docTitle: 'Request account deletion · Satsang Spark',
    sub: 'Account deletion',
    title: 'Request Account Deletion',
    intro: 'You can also do this in the app. Deleting your account permanently removes:',
    items: ['your account', 'all child profiles on the account', 'all progress', 'Sparks', 'Dress Up items', 'saved Shangars', 'leaderboard entries'],
    undo: 'This cannot be undone.',
    email: 'Email',
    emailHint: 'The email you use to log in to Satsang Spark.',
    password: 'Password',
    forgot: "Forgot your password? Reset it from the app's login screen, then come back here.",
    wrong: 'Email or password is incorrect.',
    tooMany: 'Too many attempts. Please try again later.',
    submit: 'Request Deletion',
    sending: 'Sending…',
    confirmedTitle: 'Request received',
    confirmed: 'Your request has been received and will be processed soon.',
  },
  gu: {
    docTitle: 'એકાઉન્ટ કાઢી નાખવાની વિનંતી · Satsang Spark',
    sub: 'એકાઉન્ટ કાઢી નાખવું',
    title: 'એકાઉન્ટ કાઢી નાખવાની વિનંતી',
    intro: 'તમે આ એપમાંથી પણ કરી શકો છો. એકાઉન્ટ કાઢી નાખવાથી નીચેનું બધું કાયમ માટે દૂર થશે:',
    items: ['તમારું એકાઉન્ટ', 'એકાઉન્ટ પરની બધી બાળ પ્રોફાઇલ', 'બધી પ્રગતિ', 'Sparks', 'ડ્રેસ અપ વસ્તુઓ', 'સાચવેલા શણગાર', 'લીડરબોર્ડ એન્ટ્રીઓ'],
    undo: 'આ પાછું ફેરવી શકાતું નથી.',
    email: 'ઈમેલ',
    emailHint: 'Satsang Spark માં લૉગ ઇન કરવા માટે તમે જે ઈમેલ વાપરો છો તે.',
    password: 'પાસવર્ડ',
    forgot: 'પાસવર્ડ ભૂલી ગયા છો? એપની લૉગ ઇન સ્ક્રીન પરથી તેને રીસેટ કરો, પછી અહીં પાછા આવો.',
    wrong: 'ઈમેલ અથવા પાસવર્ડ ખોટો છે.',
    tooMany: 'ઘણા બધા પ્રયાસો થયા. કૃપા કરીને થોડી વાર પછી ફરી પ્રયાસ કરો.',
    submit: 'કાઢી નાખવાની વિનંતી કરો',
    sending: 'મોકલી રહ્યા છીએ…',
    confirmedTitle: 'વિનંતી મળી ગઈ',
    confirmed: 'તમારી વિનંતી મળી ગઈ છે અને ટૂંક સમયમાં તેના પર કાર્યવાહી કરવામાં આવશે.',
  },
};

export { isEmail };

// ?lang=gu lets the app open this page in Gujarati.
const startLang = () => (typeof window !== 'undefined' && /[?&]lang=gu\b/.test(window.location.search) ? 'gu' : 'en');

export default function DeleteAccount({ confirmed = false }) {
  const [lang, setLang] = useState(startLang);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const t = TEXT[lang];
  useEffect(() => { document.title = t.docTitle; }, [t]);

  const ready = isEmail(email) && password.length > 0;
  const submit = (e) => { e.preventDefault(); if (!ready) return; run(async () => {
    try { await submitPublicRequest(email, password); setSent(true); } finally { setPassword(''); }   // never keep the password after a try
  }); };
  // Known errors in the chosen language; anything else shows the server's message.
  const errorMsg = error && (error.status === 401 ? t.wrong : error.status === 429 ? t.tooMany : error.message);

  const done = (
    <div className="public-done">
      <div className="success-mark"><Icon name="check" size={26} /></div>
      <h1>{t.confirmedTitle}</h1>
      <p>{t.confirmed}</p>
    </div>
  );

  return (
    <div className="public-page" lang={lang}>
      <div className="auth-card wide">
        <div className="public-top">
          <div className="auth-brand"><Logo size={40} /><div>Satsang Spark<small>{t.sub}</small></div></div>
          <div className="segmented" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">English</button>
            <button type="button" aria-pressed={lang === 'gu'} onClick={() => setLang('gu')} lang="gu">ગુજરાતી</button>
          </div>
        </div>

        {confirmed || sent ? done
          : <>
              <h1>{t.title}</h1>
              <p className="muted">{t.intro}</p>
              <ul className="danger-list">{t.items.map((x) => <li key={x}>{x}</li>)}</ul>
              <p className="notice danger"><Icon name="alert" size={16} /><strong>{t.undo}</strong></p>
              <form onSubmit={submit} noValidate>
                <label style={{ marginBottom: 4 }}>{t.email}
                  <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-describedby="email-hint" required />
                </label>
                <span className="hint" id="email-hint" style={{ marginBottom: 14 }}>{t.emailHint}</span>
                <label>{t.password}
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </label>
                <Err error={errorMsg} />
                <button className="danger-btn" disabled={busy || !ready}>{busy ? t.sending : t.submit}</button>
                <p className="muted" style={{ marginTop: 12, textAlign: 'center' }}>{t.forgot}</p>
              </form>
            </>}
      </div>
    </div>
  );
}
