// The business health check: 3 questions in each of 6 areas.
// Each option scores 0 (not yet) to 4 (fully in place).
// `guides`: recommend that guide when the answer scores at or below `max`.
//
// Edit freely, then run `npm run migrate` to load the changes.
// Keep each question's `code` the same once it has been used, so past answers stay linked.

module.exports = [
  // ---- Money & records ----------------------------------------------------
  {
    code: 'fin_separate',
    area: 'FIN',
    prompt: "Do you keep the business's money separate from your personal money?",
    help: 'Mixing them makes it hard to know if the business is really making profit.',
    options: [
      ["No, it's all mixed together", 0],
      ['Sometimes', 1],
      ['Mostly, in a separate box or MoMo wallet', 3],
      ['Always, with its own account', 4],
    ],
    guides: [{ slug: 'separate-business-money', max: 1 }],
  },
  {
    code: 'fin_records',
    area: 'FIN',
    prompt: 'How do you keep track of sales and spending?',
    options: [
      ["I don't write them down", 0],
      ['In my head, or now and then', 1],
      ['In a book or app, most days', 3],
      ['Every sale and expense, the same day', 4],
    ],
    guides: [{ slug: 'keep-daily-records', max: 1 }],
  },
  {
    code: 'fin_profit',
    area: 'FIN',
    prompt: 'Do you know how much profit the business made last month?',
    options: [
      ['No idea', 0],
      ['A rough guess', 1],
      ['Fairly sure', 3],
      ['Yes, from my records', 4],
    ],
    guides: [{ slug: 'keep-daily-records', max: 1 }, { slug: 'price-for-profit', max: 1 }],
  },

  // ---- Registration & compliance ------------------------------------------
  {
    code: 'comp_registered',
    area: 'COMP',
    prompt: 'Is the business registered with the Office of the Registrar of Companies (ORC)?',
    options: [
      ['Not registered', 0],
      ['I started but did not finish', 1],
      ['Registered, but the yearly renewal is late', 2],
      ['Registered and up to date', 4],
    ],
    guides: [{ slug: 'register-your-business', max: 2 }],
  },
  {
    code: 'comp_tax',
    area: 'COMP',
    prompt: 'Do you know which tax applies to your business, and do you pay it?',
    options: [
      ["I'm not sure what applies to me", 0],
      ["I know, but I'm not paying yet", 1],
      ['I pay sometimes', 2],
      ['Registered and paying on time', 4],
    ],
    guides: [{ slug: 'tax-basics', max: 2 }],
  },
  {
    code: 'comp_permits',
    area: 'COMP',
    prompt: 'Do you have the permits your trade needs (for example a district business operating permit, or FDA approval for food)?',
    options: [
      ["I don't know what I need", 0],
      ['I know, but I don\'t have them', 1],
      ['I have some of them', 2],
      ['I have them all, renewed', 4],
    ],
    guides: [{ slug: 'register-your-business', max: 1 }],
  },

  // ---- Stock & operations -----------------------------------------------------
  {
    code: 'ops_stock_known',
    area: 'OPS',
    prompt: 'Do you know how much stock you have right now?',
    options: [
      ['No', 0],
      ['Roughly', 1],
      ['I count it sometimes', 3],
      ['Yes, I keep stock records', 4],
    ],
    guides: [{ slug: 'know-your-stock', max: 1 }],
  },
  {
    code: 'ops_stockouts',
    area: 'OPS',
    prompt: 'How often do you run out of things customers ask for?',
    options: [
      ['Very often', 0],
      ['Often', 1],
      ['Sometimes', 3],
      ['Rarely', 4],
    ],
    guides: [{ slug: 'know-your-stock', max: 1 }],
  },
  {
    code: 'ops_pricing',
    area: 'OPS',
    prompt: 'How do you set your prices?',
    options: [
      ['I copy what others charge', 0],
      ['Enough to cover what I paid', 1],
      ['What it cost me, plus a set amount', 3],
      ['I know all my costs and my profit on each item', 4],
    ],
    guides: [{ slug: 'price-for-profit', max: 1 }],
  },

  // ---- Marketing & customers ------------------------------------------------------
  {
    code: 'mkt_reach',
    area: 'MKT',
    prompt: 'How do new customers find you?',
    options: [
      ['Only people passing by', 1],
      ['Word of mouth', 2],
      ['Also WhatsApp or social media', 3],
      ['A planned mix, and I know what works best', 4],
    ],
    guides: [{ slug: 'sell-on-whatsapp', max: 2 }],
  },
  {
    code: 'mkt_followup',
    area: 'MKT',
    prompt: "Do you keep your customers' contacts and stay in touch?",
    options: [
      ['No', 0],
      ['I have a few numbers', 1],
      ['For most regular customers', 3],
      ['Yes, and I tell them about new stock and offers', 4],
    ],
    guides: [{ slug: 'sell-on-whatsapp', max: 1 }],
  },
  {
    code: 'mkt_credit',
    area: 'MKT',
    prompt: 'When customers buy on credit, do they pay on time?',
    options: [
      ['Many pay late, or never', 0],
      ['Some pay late', 1],
      ['Most pay on time', 3],
      ["All pay on time, or I don't sell on credit", 4],
    ],
    guides: [{ slug: 'credit-and-getting-paid', max: 1 }],
  },

  // ---- Staff & people ----------------------------------------------------------------
  {
    code: 'ppl_agreement',
    area: 'PEOPLE',
    prompt: 'Do your workers or apprentices have a written agreement?',
    options: [
      ["I don't have workers yet", 4],
      ['No agreement', 0],
      ['A spoken agreement', 1],
      ['Written, for everyone', 4],
    ],
    guides: [{ slug: 'hiring-your-first-worker', max: 1 }],
  },
  {
    code: 'ppl_ssnit',
    area: 'PEOPLE',
    prompt: 'Do you pay SSNIT contributions for your workers?',
    options: [
      ["I don't have workers yet", 4],
      ['No', 0],
      ['For some of them', 1],
      ['Yes, for everyone, every month', 4],
    ],
    guides: [{ slug: 'hiring-your-first-worker', max: 1 }],
  },
  {
    code: 'ppl_cover',
    area: 'PEOPLE',
    prompt: 'If you were away for a week, could the business keep running?',
    options: [
      ['No, it would stop', 0],
      ['Only just', 1],
      ['Mostly', 3],
      ['Yes, someone is trained to run it', 4],
    ],
    guides: [{ slug: 'hiring-your-first-worker', max: 0 }],
  },

  // ---- Access to finance ---------------------------------------------------------------
  {
    code: 'fund_records',
    area: 'FUND',
    prompt: 'Do you have records a lender could check, such as sales records or MoMo and bank statements?',
    options: [
      ['None', 0],
      ['A few', 1],
      ['Several months', 3],
      ['A year or more, kept up to date', 4],
    ],
    guides: [{ slug: 'get-loan-ready', max: 1 }],
  },
  {
    code: 'fund_options',
    area: 'FUND',
    prompt: 'Do you know where you could get money to grow (banks, microfinance, savings groups, GEA programmes)?',
    options: [
      ['No', 0],
      ['A little', 1],
      ['I know some options', 3],
      ['I know them and have compared them', 4],
    ],
    guides: [{ slug: 'find-funding', max: 1 }],
  },
  {
    code: 'fund_buffer',
    area: 'FUND',
    prompt: 'Does the business have savings to keep going if sales drop for a month?',
    options: [
      ['None', 0],
      ['A little', 1],
      ['About a month', 3],
      ['More than a month', 4],
    ],
    guides: [{ slug: 'separate-business-money', max: 1 }],
  },
];
