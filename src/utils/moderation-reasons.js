// Reasons the admin picks when moderating an offer. "Pedir ajuste" leaves out what the
// company cannot fix by editing the offer.
export const REJECT_REASONS = [
  'Foto inadequada',
  'Produto proibido',
  'Preço fora do padrão',
  'Descrição insuficiente',
  'Categoria incorreta',
];

export const ADJUST_REASONS = REJECT_REASONS.filter((reason) => reason !== 'Produto proibido');
