// Mock data for Linka
export const institution = {
  name: 'iCEV',
  fullName: 'Instituto de Ensino Superior iCEV',
  domain: '@icev.edu.br',
  primaryColor: '#2563eb'
};

export const currentUser = {
  id: 1,
  name: 'João',
  fullName: 'João Pedro Silva',
  email: 'joao.silva@icev.edu.br',
  course: 'Administração',
  semester: '5º semestre',
  avatar: 'JP',
  whatsapp: '5586999001122'
};

export const categories = [
  { id: 'all', name: 'Todos', icon: '✦' },
  { id: 'food', name: 'Lanches & Bebidas', icon: '🍔', maxSlots: 5, duration: '12h' },
  { id: 'fashion', name: 'Moda & Acessórios', icon: '👕', maxSlots: 5, duration: '24h' },
  { id: 'services', name: 'Serviços Presenciais', icon: '✂️', maxSlots: 5, duration: '24h' },
  { id: 'digital', name: 'Digital & Criativo', icon: '🎨', maxSlots: 5, duration: '24h' },
  { id: 'others', name: 'Outros', icon: '📦', maxSlots: 5, duration: '24h' }
];

export const products = [
  {
    id: 1,
    title: 'Brownie Artesanal com Nozes',
    description: 'Brownie caseiro feito com chocolate belga e nozes selecionadas. Embalagem individual, perfeito para o intervalo.',
    category: 'food',
    originalPrice: 12.00,
    discount: 25,
    discountPrice: 9.00,
    seller: { name: 'Maria Clara', course: 'Gastronomia', semester: '3º sem', avatar: 'MC', whatsapp: '5586999112233', verified: true },
    images: ['brownie'],
    expiresIn: '04h 32min',
    slots: { used: 3, total: 5 },
    clicks: 47,
    couponsGenerated: 12,
    couponsUsed: 8,
    status: 'active',
    createdAt: '2026-04-27T10:00:00'
  },
  {
    id: 2,
    title: 'Camiseta Universitária iCEV 2026',
    description: 'Camiseta oficial da turma de Administração 2026. Algodão premium, estampa em silk de alta qualidade.',
    category: 'fashion',
    originalPrice: 69.90,
    discount: 15,
    discountPrice: 59.42,
    seller: { name: 'Lucas Mendes', course: 'Design', semester: '4º sem', avatar: 'LM', whatsapp: '5586999334455', verified: true },
    images: ['camiseta'],
    expiresIn: '18h 15min',
    slots: { used: 2, total: 5 },
    clicks: 31,
    couponsGenerated: 8,
    couponsUsed: 5,
    status: 'active',
    createdAt: '2026-04-27T08:00:00'
  },
  {
    id: 3,
    title: 'Aula Particular de Cálculo I',
    description: 'Reforço em Cálculo I com monitor aprovado com nota máxima. Individual ou em grupo de até 3 alunos.',
    category: 'services',
    originalPrice: 80.00,
    discount: 20,
    discountPrice: 64.00,
    seller: { name: 'Ana Beatriz', course: 'Engenharia', semester: '6º sem', avatar: 'AB', whatsapp: '5586999556677', verified: true },
    images: ['aula'],
    expiresIn: '22h 10min',
    slots: { used: 4, total: 5 },
    clicks: 56,
    couponsGenerated: 18,
    couponsUsed: 14,
    status: 'active',
    createdAt: '2026-04-26T14:00:00'
  },
  {
    id: 4,
    title: 'Design de Logo Profissional',
    description: 'Criação de logotipo para seu projeto acadêmico ou empreendimento. Inclui 3 propostas e arquivo vetorial.',
    category: 'digital',
    originalPrice: 150.00,
    discount: 30,
    discountPrice: 105.00,
    seller: { name: 'Pedro Henrique', course: 'Design Gráfico', semester: '5º sem', avatar: 'PH', whatsapp: '5586999778899', verified: true },
    images: ['logo-design'],
    expiresIn: '10h 45min',
    slots: { used: 1, total: 5 },
    clicks: 23,
    couponsGenerated: 6,
    couponsUsed: 3,
    status: 'active',
    createdAt: '2026-04-27T06:00:00'
  },
  {
    id: 5,
    title: 'Açaí no Copo 500ml',
    description: 'Açaí puro da Amazônia com granola, banana e leite condensado. Entrega no campus entre 11h e 14h.',
    category: 'food',
    originalPrice: 18.00,
    discount: 20,
    discountPrice: 14.40,
    seller: { name: 'Rafaela Costa', course: 'Nutrição', semester: '4º sem', avatar: 'RC', whatsapp: '5586999001133', verified: true },
    images: ['acai'],
    expiresIn: '02h 20min',
    slots: { used: 5, total: 5 },
    clicks: 89,
    couponsGenerated: 22,
    couponsUsed: 19,
    status: 'active',
    createdAt: '2026-04-27T09:00:00'
  },
  {
    id: 6,
    title: 'Caderno Personalizado A5',
    description: 'Caderno artesanal com capa personalizada e 100 folhas pautadas. Ideal para anotações acadêmicas.',
    category: 'others',
    originalPrice: 35.00,
    discount: 15,
    discountPrice: 29.75,
    seller: { name: 'Isabela Lima', course: 'Artes Visuais', semester: '3º sem', avatar: 'IL', whatsapp: '5586999224466', verified: true },
    images: ['caderno'],
    expiresIn: '16h 55min',
    slots: { used: 2, total: 5 },
    clicks: 15,
    couponsGenerated: 4,
    couponsUsed: 2,
    status: 'active',
    createdAt: '2026-04-27T07:30:00'
  }
];

export const sellerAds = [
  { ...products[0], status: 'active', timeLeft: '04h 32min' },
  {
    id: 7, title: 'Brigadeiro Gourmet (caixa com 12)', category: 'food',
    originalPrice: 25.00, discount: 20, discountPrice: 20.00,
    status: 'pending', seller: currentUser, images: ['brigadeiro'],
    clicks: 0, couponsGenerated: 0, couponsUsed: 0, slots: { used: 0, total: 5 }
  },
  {
    id: 8, title: 'Bolo de Pote Prestígio', category: 'food',
    originalPrice: 15.00, discount: 10, discountPrice: 13.50,
    status: 'queue', queuePosition: 3, estimatedEntry: '~2h 30min',
    seller: currentUser, images: ['bolo'],
    clicks: 0, couponsGenerated: 0, couponsUsed: 0, slots: { used: 5, total: 5 }
  },
  {
    id: 9, title: 'Sanduíche Natural Integral', category: 'food',
    originalPrice: 14.00, discount: 15, discountPrice: 11.90,
    status: 'expired', seller: currentUser, images: ['sanduiche'],
    clicks: 34, couponsGenerated: 9, couponsUsed: 7, slots: { used: 0, total: 5 }
  },
  {
    id: 10, title: 'Salgado Assado Misto', category: 'food',
    originalPrice: 8.00, discount: 50, discountPrice: 4.00,
    status: 'rejected', rejectionReason: 'Preço fora do padrão',
    seller: currentUser, images: ['salgado'],
    clicks: 0, couponsGenerated: 0, couponsUsed: 0, slots: { used: 0, total: 5 }
  }
];

export const coupons = [
  { code: 'A7K2', productId: 1, product: 'Brownie Artesanal com Nozes', seller: 'Maria Clara', status: 'active', createdAt: '27/04/2026 10:15', validUntil: '28/04/2026 10:15' },
  { code: 'B3F9', productId: 3, product: 'Aula Particular de Cálculo I', seller: 'Ana Beatriz', status: 'used', createdAt: '26/04/2026 14:30', validUntil: '27/04/2026 14:30' },
  { code: 'C1M5', productId: 5, product: 'Açaí no Copo 500ml', seller: 'Rafaela Costa', status: 'expired', createdAt: '25/04/2026 11:00', validUntil: '26/04/2026 11:00' }
];

export const sellerCoupons = [
  { code: 'X4R8', buyer: 'Thiago Santos', product: 'Brownie Artesanal com Nozes', status: 'pending', createdAt: '27/04/2026 11:20' },
  { code: 'Y2T6', buyer: 'Camila Rocha', product: 'Brownie Artesanal com Nozes', status: 'pending', createdAt: '27/04/2026 10:45' },
  { code: 'Z9P1', buyer: 'Felipe Alves', product: 'Brownie Artesanal com Nozes', status: 'used', createdAt: '27/04/2026 09:30' },
  { code: 'W7L3', buyer: 'Juliana Costa', product: 'Brownie Artesanal com Nozes', status: 'used', createdAt: '26/04/2026 16:10' },
  { code: 'V5N8', buyer: 'Ricardo Lima', product: 'Brownie Artesanal com Nozes', status: 'expired', createdAt: '25/04/2026 13:00' }
];

export const pendingAds = [
  {
    id: 11, title: 'Espetinho de Frango no Palito', category: 'food',
    originalPrice: 10.00, discount: 20, discountPrice: 8.00,
    seller: { name: 'Marcos Vinicius', course: 'Administração', semester: '2º sem', avatar: 'MV', verified: true },
    images: ['espetinho'], waitTime: '45 min', sellerHistory: { approved: 3, rejected: 0 }
  },
  {
    id: 12, title: 'Corte de Cabelo Masculino', category: 'services',
    originalPrice: 40.00, discount: 25, discountPrice: 30.00,
    seller: { name: 'Breno Souza', course: 'Estética', semester: '3º sem', avatar: 'BS', verified: true },
    images: ['corte'], waitTime: '1h 20min', sellerHistory: { approved: 5, rejected: 1 }
  },
  {
    id: 13, title: 'Pulseira Artesanal Macramê', category: 'fashion',
    originalPrice: 25.00, discount: 10, discountPrice: 22.50,
    seller: { name: 'Larissa Nunes', course: 'Artes', semester: '2º sem', avatar: 'LN', verified: false },
    images: ['pulseira'], waitTime: '2h 10min', sellerHistory: { approved: 0, rejected: 0 }
  }
];

export const adminStats = {
  students: { value: 342, change: '+12%', positive: true },
  clicks: { value: '2.847', change: '+23%', positive: true },
  couponsGenerated: { value: 486, change: '+18%', positive: true },
  couponsUsed: { value: 312, change: '+15%', positive: true },
  conversionRate: { value: '64%', change: '+3%', positive: true },
  pendingAds: { value: 3, change: '-2', positive: true }
};

export const categoryHeat = [
  { id: 'food', name: 'Lanches & Bebidas', slotsUsed: 5, slotsTotal: 5, queue: 4, duration: '12h', status: 'full' },
  { id: 'fashion', name: 'Moda & Acessórios', slotsUsed: 4, slotsTotal: 5, queue: 1, duration: '24h', status: 'warning' },
  { id: 'services', name: 'Serviços Presenciais', slotsUsed: 4, slotsTotal: 5, queue: 2, duration: '24h', status: 'warning' },
  { id: 'digital', name: 'Digital & Criativo', slotsUsed: 2, slotsTotal: 5, queue: 0, duration: '24h', status: 'available' },
  { id: 'others', name: 'Outros', slotsUsed: 2, slotsTotal: 5, queue: 0, duration: '24h', status: 'available' }
];

export const alerts = [
  { id: 1, level: 'critical', title: 'Categoria "Lanches" lotada', description: '5/5 vagas ocupadas com 4 anúncios na fila.', time: 'Há 15 min', action: 'Editar vagas' },
  { id: 2, level: 'critical', title: 'Anúncio pendente há 2h+', description: '"Pulseira Artesanal Macramê" aguardando moderação.', time: 'Há 2h 10min', action: 'Moderar agora' },
  { id: 3, level: 'attention', title: 'Categoria "Serviços" em 80%', description: '4 de 5 vagas ocupadas com 2 na fila.', time: 'Há 30 min', action: 'Visualizar' },
  { id: 4, level: 'attention', title: 'Tentativa de reuso de cupom', description: 'Cupom Z9P1 (usado) tentou ser reutilizado por Felipe Alves.', time: 'Há 1h', action: 'Ver detalhes' }
];

export const rejectReasons = [
  'Foto inadequada',
  'Produto proibido',
  'Preço fora do padrão',
  'Descrição insuficiente',
  'Categoria incorreta'
];

// Color palettes for product placeholders
export const productColors = {
  brownie: { bg: '#4a3728', accent: '#8B6914' },
  camiseta: { bg: '#1e3a5f', accent: '#3b82f6' },
  aula: { bg: '#1a4731', accent: '#22c55e' },
  'logo-design': { bg: '#581c87', accent: '#a855f7' },
  acai: { bg: '#4c1d95', accent: '#7c3aed' },
  caderno: { bg: '#7c2d12', accent: '#ea580c' },
  brigadeiro: { bg: '#3f1f0a', accent: '#92400e' },
  bolo: { bg: '#831843', accent: '#ec4899' },
  sanduiche: { bg: '#365314', accent: '#84cc16' },
  salgado: { bg: '#713f12', accent: '#ca8a04' },
  espetinho: { bg: '#7c2d12', accent: '#f97316' },
  corte: { bg: '#1e293b', accent: '#64748b' },
  pulseira: { bg: '#134e4a', accent: '#14b8a6' }
};

// Seller stats for dashboard
export const sellerStats = {
  activeAds: 1,
  couponsGenerated: 12,
  couponsUsed: 8,
  conversionRate: '66%',
  totalClicks: 47
};
