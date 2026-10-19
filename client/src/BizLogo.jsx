// The business's logo, or its initials in a circle when it has none.
export default function BizLogo({ business, size = 44, className = '' }) {
  const initials = (business?.name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return business?.logoUrl
    ? <img className={`biz-logo ${className}`} src={business.logoUrl} alt={`${business.name} logo`} style={style} />
    : <span className={`biz-logo biz-logo-initials ${className}`} style={style} aria-hidden="true">{initials || '?'}</span>;
}
