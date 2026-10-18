// Form pieces shared by the admin's "new business" form and the owner's first setup.
import { Field } from './components.jsx';
import { useT } from './i18n.jsx';

const LEGAL_FORMS = ['unregistered', 'sole_proprietorship', 'partnership', 'company_ltd_shares'];

export const emptyBusiness = {
  name: '', sectorCode: '', regionCode: '', town: '', legalForm: 'unregistered',
};
export const emptyMoney = {
  cashOpeningBalance: '', useMomo: true, momoProvider: 'MTN', momoOpeningBalance: '',
  useBank: false, bankName: '', bankOpeningBalance: '',
};

export function businessBody(f) {
  return {
    name: f.name, sectorCode: f.sectorCode || null, regionCode: f.regionCode || null,
    town: f.town || null, legalForm: f.legalForm,
  };
}
export function moneyBody(f) {
  return {
    cashOpeningBalance: f.cashOpeningBalance || 0,
    momo: f.useMomo ? { provider: f.momoProvider, openingBalance: f.momoOpeningBalance || 0 } : null,
    bank: f.useBank ? { name: f.bankName, openingBalance: f.bankOpeningBalance || 0 } : null,
  };
}

export function BusinessFields({ form, set, errors, lookups }) {
  const { t } = useT();
  return (
    <>
      <Field label={t('setup.name')} error={errors.name}>
        {(p) => <input {...p} value={form.name} onChange={set('name')} required />}
      </Field>
      <fieldset className="field">
        <legend>{t('setup.sector')}</legend>
        <div className="chips">
          {lookups.sectors.map((s) => (
            <label key={s.code} className={'chip' + (form.sectorCode === s.code ? ' chip-on' : '')}>
              <input type="radio" name="sector" value={s.code} checked={form.sectorCode === s.code} onChange={set('sectorCode')} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid-2">
        <Field label={t('setup.region')} error={errors.regionCode}>
          {(p) => (
            <select {...p} value={form.regionCode} onChange={set('regionCode')}>
              <option value="">{t('common.choose')}</option>
              {lookups.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('setup.town')} error={errors.town}>
          {(p) => <input {...p} value={form.town} onChange={set('town')} />}
        </Field>
      </div>
      <fieldset className="field">
        <legend>{t('setup.registered')}</legend>
        <div className="options">
          {LEGAL_FORMS.map((value) => (
            <label key={value} className={'option' + (form.legalForm === value ? ' option-on' : '')}>
              <input type="radio" name="legalForm" value={value} checked={form.legalForm === value} onChange={set('legalForm')} />
              {t(`setup.reg.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function MoneyFields({ form, set, errors }) {
  const { t } = useT();
  return (
    <>
      <Field label={t('setup.cash')} error={errors.cashOpeningBalance} hint={t('setup.cashHint')}>
        {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01"
          value={form.cashOpeningBalance} onChange={set('cashOpeningBalance')} placeholder="0.00" />}
      </Field>
      <label className="option toggle">
        <input type="checkbox" checked={form.useMomo} onChange={set('useMomo')} />
        {t('setup.useMomo')}
      </label>
      {form.useMomo && (
        <div className="grid-2">
          <Field label={t('setup.network')} error={errors['momo.provider']}>
            {(p) => (
              <select {...p} value={form.momoProvider} onChange={set('momoProvider')}>
                <option value="MTN">MTN</option>
                <option value="Telecel">Telecel</option>
                <option value="AT">AT</option>
              </select>
            )}
          </Field>
          <Field label={t('setup.momoBalance')} error={errors['momo.openingBalance']}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01"
              value={form.momoOpeningBalance} onChange={set('momoOpeningBalance')} placeholder="0.00" />}
          </Field>
        </div>
      )}
      <label className="option toggle">
        <input type="checkbox" checked={form.useBank} onChange={set('useBank')} />
        {t('setup.useBank')}
      </label>
      {!form.useBank && <p className="muted small">{t('setup.bankLater')}</p>}
      {form.useBank && (
        <div className="grid-2">
          <Field label={t('setup.bankName')} error={errors['bank.name']}>
            {(p) => <input {...p} value={form.bankName} onChange={set('bankName')} placeholder={t('setup.bankNamePh')} />}
          </Field>
          <Field label={t('setup.bankBalance')} error={errors['bank.openingBalance']}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01"
              value={form.bankOpeningBalance} onChange={set('bankOpeningBalance')} placeholder="0.00" />}
          </Field>
        </div>
      )}
    </>
  );
}

// onChange helper: checkboxes give checked, everything else gives value.
export const setter = (form, setForm) => (k) => (e) =>
  setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
