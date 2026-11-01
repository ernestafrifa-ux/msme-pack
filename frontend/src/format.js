export const fmt = (n) => {
  const v = Math.round((n || 0) * 100) / 100;
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? "(" : "") + "GH₵ " + s + (neg ? ")" : "");
};

export const fmtPlain = (n) => {
  const v = Math.round((n || 0) * 100) / 100;
  return v.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const quarterOf = (dateStr) => Math.floor((parseInt(dateStr.slice(5, 7), 10) - 1) / 3) + 1;

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const TRANSFER_TYPES = [
  { id: "cash-to-bank", label: "Cash → Bank", from: "cash", to: "bank" },
  { id: "bank-to-cash", label: "Bank → Cash", from: "bank", to: "cash" },
  { id: "bank-to-bank", label: "Bank → Bank", from: "bank", to: "bank" },
];

export const DISCLOSURE_CATEGORIES = [
  { id: "receivable", label: "Receivables" },
  { id: "payable", label: "Payables" },
  { id: "investment", label: "Investments" },
  { id: "trustfund-conference", label: "Trust Funds — Conference" },
  { id: "trustfund-district", label: "Trust Funds — District" },
];
