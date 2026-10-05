import { ArrowLeft, ArrowRight, Check, Info, Loader2, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ProductArtwork } from '../components/ProductArtwork';
import { attachEnquiryPdfUrl, createReference, submitEnquiry } from '../services/enquiries';
import { uploadEnquiryPdf } from '../services/enquiryPdfUpload';
import { enquiryPdfDocument } from '../utils/enquiryPdf';
import { useContent } from '../hooks/useContent';
import { useEnquiry } from '../hooks/useEnquiry';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { enquiryWhatsAppUrl } from '../utils/enquiryDocuments';
import { formatCurrency } from '../utils/format';

const initialForm = {
  name: '',
  mobile: '',
  email: '',
  address: '',
  pin: '',
  city: '',
  occasion: '',
  preferredContact: 'Phone call',
  notes: '',
};

const preferredContactOptions = ['Phone call', 'WhatsApp message', 'Email reply', 'Any is fine'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE_PATTERN = /^\+?[0-9\s()-]{10,16}$/;
const PIN_PATTERN = /^[0-9]{6}$/;

const validateForm = (form) => {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Full name is required.';
  if (!form.mobile.trim()) errors.mobile = 'Mobile number is required.';
  else if (!MOBILE_PATTERN.test(form.mobile.trim())) errors.mobile = 'Enter a valid mobile number (digits, at least 10).';
  if (!form.email.trim()) errors.email = 'Email address is required.';
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Enter a valid email address.';
  if (!form.city.trim()) errors.city = 'City / town is required.';
  if (!form.address.trim()) errors.address = 'Delivery address is required.';
  if (!form.pin.trim()) errors.pin = 'PIN code is required.';
  else if (!PIN_PATTERN.test(form.pin.trim())) errors.pin = 'PIN code must be 6 digits.';
  if (!form.occasion.trim()) errors.occasion = 'Occasion is required.';
  return errors;
};

export function EnquiryFormPage() {
  useDocumentTitle('Send your enquiry');
  const { items, itemCount, indicativeTotal } = useEnquiry();
  const { siteContent } = useContent();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedEnquiry, setSavedEnquiry] = useState(null);
  const [step, setStep] = useState('');

  if (!items.length && !savedEnquiry) return <Navigate to="/cart" replace />;

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');

    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.values(validationErrors).some(Boolean)) {
      setError('Please fix the highlighted fields and try again.');
      return;
    }
    if (!items.length) {
      setError('Your cart is empty. Add products before saving the enquiry.');
      return;
    }

    setIsSubmitting(true);
    setStep('Uploading PDF...');
    try {
      const enquiry = await submitEnquiry({
        ...form,
        reference: createReference(),
        items,
        indicativeTotal,
        itemCount,
      });

      setStep('Generating PDF...');
      try {
        enquiryPdfDocument(enquiry);
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
        throw new Error('PDF generation failed. Please try again.');
      }

      setStep('Uploading PDF...');
      let pdfUrl;
      try {
        pdfUrl = await uploadEnquiryPdf(enquiry);
      } catch (uploadError) {
        console.error('PDF upload failed:', uploadError);
        throw new Error('PDF upload failed. Please try again.');
      }

      if (!pdfUrl || !/^https?:\/\//.test(pdfUrl)) {
        console.error('PDF URL missing or invalid:', pdfUrl);
        throw new Error('Unable to create PDF link. Please try again.');
      }

      const updated = attachEnquiryPdfUrl(enquiry.reference, pdfUrl) || { ...enquiry, pdfUrl };
      setSavedEnquiry(updated);
      window.open(enquiryWhatsAppUrl(updated), '_blank', 'noopener,noreferrer');
    } catch (submitError) {
      console.error('Enquiry submission failed:', submitError);
      setError(submitError.message || 'Unable to save your enquiry. Please try again.');
    } finally {
      setStep('');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-cream">
      <section className="border-b border-stone-200 bg-white">
        <div className="container-shell py-10 sm:py-14">
          <Link to="/cart" className="inline-flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-stone-400 transition hover:text-goldInk"><ArrowLeft size={14} /> Back to cart</Link>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="eyebrow">Last step</span>
              <h1 className="mt-4 font-display text-5xl leading-none tracking-[-0.05em] text-ink sm:text-6xl">Send your <span className="text-goldInk">enquiry.</span></h1>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-marigold/30 bg-secondarySoft px-4 py-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-goldInk"><LockKeyhole size={13} /> No payment taken</div>
          </div>
        </div>
      </section>

      <section className="container-shell grid gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_22rem] lg:gap-14">
        {savedEnquiry ? (
          <div className="space-y-8">
            <div className="card-surface rounded-2xl p-6 sm:p-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={26} /></div>
              <h2 className="mt-6 font-display text-3xl tracking-[-0.03em] text-ink sm:text-4xl">Your enquiry has been saved successfully.</h2>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                Enquiry prepared successfully.<br />
                Enquiry No: <strong className="text-ink">{savedEnquiry.reference}</strong><br />
                PDF attached as a link in your WhatsApp message.
              </p>
            </div>

            <div className="card-surface rounded-2xl p-6 sm:p-8">
              <h3 className="font-display text-2xl text-ink">Selected products</h3>
              <div className="mt-5 space-y-4">
                {savedEnquiry.items.map((item) => (
                  <div className="flex items-center gap-3" key={item.id}>
                    <ProductArtwork product={item} className="h-12 min-h-0 w-12 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink">{item.name}</p>
                      <p className="mt-0.5 text-[0.65rem] text-stone-400">Qty {item.quantity}{item.packSize ? ` · ${item.packSize}` : ''}</p>
                    </div>
                    <p className="text-xs font-bold text-ink">{formatCurrency(item.price * item.quantity)}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-4">
                <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-stone-400">{savedEnquiry.items.reduce((sum, item) => sum + item.quantity, 0)} total units</span>
                <span className="text-xl font-bold text-ink">{formatCurrency(savedEnquiry.indicativeTotal)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a className="btn-primary" href={enquiryWhatsAppUrl(savedEnquiry)} target="_blank" rel="noopener noreferrer">
                Send Enquiry on WhatsApp <MessageCircle size={15} />
              </a>
            </div>
          </div>
        ) : (
        <form className="space-y-8" onSubmit={handleSave}>
          <div className="rounded-2xl border border-marigold/25 bg-secondarySoft p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-goldInk" size={18} />
              <p className="text-xs leading-5 text-stone-600">After you confirm, we save your enquiry and prepare a PDF copy that is shared through WhatsApp. No payment is taken — call or WhatsApp us on the shop number below to confirm your order.</p>
            </div>
          </div>

            <FormSection number="01" title="Your details" copy="We only use these to reply to your enquiry.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" value={form.name} onChange={updateField('name')} placeholder="Your name" required error={errors.name} autoComplete="name" />
              <Field label="Mobile number" value={form.mobile} onChange={updateField('mobile')} placeholder="+91 00000 00000" type="tel" required error={errors.mobile} autoComplete="tel" />
              <Field label="Email address" value={form.email} onChange={updateField('email')} placeholder="you@example.com" type="email" required error={errors.email} autoComplete="email" />
              <Field label="City / town" value={form.city} onChange={updateField('city')} placeholder="Sivakasi" required error={errors.city} autoComplete="address-level2" />
              <label className="sm:col-span-2">
                <span className="field-label">Delivery address <span className="text-ember">*</span></span>
                <textarea className="field-input min-h-28 resize-y" value={form.address} onChange={updateField('address')} placeholder="House / street / area / state" required autoComplete="street-address" />
                {errors.address && <span className="mt-1 block text-[0.65rem] font-semibold text-rose-600">{errors.address}</span>}
              </label>
              <Field label="PIN code" value={form.pin} onChange={updateField('pin')} placeholder="6-digit PIN" required error={errors.pin} inputMode="numeric" autoComplete="postal-code" />
              <Field label="Occasion" value={form.occasion} onChange={updateField('occasion')} placeholder="Diwali, New Year, event..." required error={errors.occasion} />
            </div>
          </FormSection>

          <FormSection number="02" title="How should we reach you?" copy="Pick whatever is easiest for you.">
            <div className="grid gap-3 sm:grid-cols-2">
              {preferredContactOptions.map((option) => (
                <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${form.preferredContact === option ? 'border-ember border-2 bg-secondarySoft' : 'border-stone-200 bg-white hover:border-stone-300'}`}>
                  <input className="sr-only" type="radio" name="preferredContact" value={option} checked={form.preferredContact === option} onChange={updateField('preferredContact')} />
                  <span className={`h-2 w-2 shrink-0 rounded-full ${form.preferredContact === option ? 'bg-ember' : 'bg-stone-300'}`} />
                  <span className="text-xs font-bold text-ink">{option}</span>
                </label>
              ))}
            </div>
            <label className="mt-5 block">
              <span className="field-label">Anything else we should know?</span>
              <textarea className="field-input min-h-28 resize-y" value={form.notes} onChange={updateField('notes')} placeholder="Delivery timing, preferred pack size, budget guidance..." />
            </label>
          </FormSection>

          {error && <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</p>}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button className="btn-primary w-full sm:w-auto" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (step || 'Uploading PDF...') : 'Send Enquiry on WhatsApp'} {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
            </button>
          </div>
        </form>
        )}

        {savedEnquiry ? null : (
        <EnquirySummary items={items} itemCount={itemCount} indicativeTotal={indicativeTotal} contact={siteContent.contact} />
        )}
      </section>
    </div>
  );
}

function FormSection({ number, title, copy, children }) {
  return (
    <section className="card-surface rounded-2xl p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-[0.62rem] font-bold tracking-[0.15em] text-goldInk">{number}</span>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        {copy && <p className="w-full text-xs text-stone-400">{copy}</p>}
      </div>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, error, ...rest }) {
  return (
    <label>
      <span className="field-label">{label} {required && <span className="text-ember">*</span>}</span>
      <input className="field-input" type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} {...rest} />
      {error && <span className="mt-1 block text-[0.65rem] font-semibold text-rose-600">{error}</span>}
    </label>
  );
}

function EnquirySummary({ items, itemCount, indicativeTotal, contact }) {
  const hasPhone = Boolean(String(contact?.phone || '').trim());
  return (
    <aside className="h-fit rounded-2xl bg-ember p-6 text-charcoal lg:sticky lg:top-32">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-charcoal">Your selection</p>
      <div className="mt-6 max-h-[19rem] space-y-4 overflow-y-auto pr-1">
        {items.map((item) => (
          <div className="flex gap-3" key={item.id}>
            <ProductArtwork product={item} className="h-14 min-h-0 w-14 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-charcoal">{item.name}</p>
              <p className="mt-1 text-[0.65rem] text-charcoal/75">Qty {item.quantity} &middot; {item.packSize}</p>
            </div>
            <p className="text-xs font-bold text-charcoal">{formatCurrency(item.price * item.quantity)}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 border-t border-white/25 pt-5">
        <div className="flex items-end justify-between">
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-charcoal/85">{itemCount} listings</span>
          <span className="text-2xl font-bold text-charcoal">{formatCurrency(indicativeTotal)}</span>
        </div>
        <p className="mt-2 text-[0.62rem] leading-5 text-charcoal/75">NET RAT based. Delivery, final price and availability are confirmed in the reply.</p>
      </div>
      <div className="mt-6 flex gap-3 rounded-xl bg-white p-4 text-[0.65rem] leading-5 text-ink/70">
        <Info className="mt-0.5 shrink-0 text-goldInk" size={15} />
        <span>{hasPhone ? `We usually reply on ${contact.phone}.` : 'Add your preferred contact method so we can reply to you.'}</span>
      </div>
      <Link className="mt-5 inline-flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-charcoal transition hover:text-ink" to="/faq">Read common questions <ArrowRight size={13} /></Link>
    </aside>
  );
}
