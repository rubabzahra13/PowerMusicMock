import {
  SIGNATURE_COMPANY,
  SIGNATURE_PERSON,
  splitDraftBody,
} from '../../utils/emailSignature';

export default function DraftBodyDisplay({ body, inboxTitle, className = '' }) {
  const { main, signature } = splitDraftBody(body, inboxTitle);

  if (!signature) {
    return (
      <div className={`whitespace-pre-wrap ${className}`.trim()}>
        {splitDraftBody(body, inboxTitle).main}
      </div>
    );
  }

  const lines = signature.split('\n');
  const inboxLine = lines[3] || '';
  const companyLine = lines[4] || SIGNATURE_COMPANY;

  return (
    <div className={`leading-relaxed ${className}`.trim()}>
      {main ? <span className="whitespace-pre-wrap">{main}</span> : null}
      {main ? <span className="block h-4" aria-hidden /> : null}
      <span className="whitespace-pre-wrap block">Thank you.</span>
      <span className="block h-4" aria-hidden />
      <strong className="font-semibold text-[var(--color-text-primary)]">{SIGNATURE_PERSON}</strong>
      <span className="block whitespace-pre-wrap">{inboxLine}</span>
      <span className="block whitespace-pre-wrap">{companyLine}</span>
    </div>
  );
}
