import { useEffect, useRef } from 'react';
import { X, ExternalLink, Play } from 'lucide-react';
import { referenceThumbnail, referenceWatchUrl } from './templateReferences';

export default function TemplatePreview({ item, onClose, onUse, busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const { template, reference, artwork } = item;
  return <dialog ref={ref} className="ai-preview-dialog" aria-labelledby="ai-preview-title" onCancel={onClose} onClose={onClose}>
    <header><div><small>{reference ? 'ORIGINAL REFERENCE' : artwork ? 'CONCEPT IMAGE' : 'TEMPLATE DETAILS'}</small><h3 id="ai-preview-title">{reference?.title || template.title}</h3></div>
      <button type="button" onClick={onClose} aria-label="Close template preview"><X size={22}/></button>
    </header>
    {reference ? <>
      <a className="ai-original-poster" href={referenceWatchUrl(reference)} target="_blank" rel="noopener" aria-label={`Play original video: ${reference.title}`}>
        <img src={referenceThumbnail(reference)} alt={reference.title}/>
        <span><Play size={24}/> Play original video <ExternalLink size={16}/></span>
      </a>
      <p className="ai-reference-credit">Original video: {reference.credit}. This shows the reference performers. Your generated clip uses the photos you upload.</p>
      <small className="ai-player-help">Opens the official video on YouTube. Preview uses no Studio tokens.</small>
    </> : <>
      {artwork && <img className="ai-concept-large" src={`/${artwork.src}`} alt={artwork.alt}/>}
      <p>{artwork ? 'This is a concept image. No sample video is attached to this template.' : template.subtitle}</p>
      <p>Add {template.minImages === template.maxImages ? template.minImages : `${template.minImages}–${template.maxImages}`} photo{template.maxImages === 1 ? '' : 's'} to create your own {template.kind === 'video' ? `${template.duration || 'short'} video` : 'image'}. Generation: {template.tokens} tokens.</p>
    </>}
    <button type="button" className="ai-use-template" disabled={busy} onClick={() => onUse(template.id)}>Use this template</button>
  </dialog>;
}
