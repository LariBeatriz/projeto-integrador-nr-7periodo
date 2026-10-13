// Catálogo inicial de lixeiras e resíduos (escopo mínimo viável).
// Cores seguem a Resolução CONAMA nº 275/2001. As mensagens educativas
// devem ser revisadas pela equipe antes dos testes oficiais (seção 4.1).

const LIXEIRAS = [
  { codigo: 'papel', nome: 'Papel', categoria: 'papel', cor: '#1e5bc6', simbolo: 'P', icone: '📄', pontos_acerto: 100 },
  { codigo: 'plastico', nome: 'Plástico', categoria: 'plastico', cor: '#d32f2f', simbolo: 'PL', icone: '🧴', pontos_acerto: 100 },
  { codigo: 'vidro', nome: 'Vidro', categoria: 'vidro', cor: '#2e7d32', simbolo: 'V', icone: '🍾', pontos_acerto: 100 },
  { codigo: 'metal', nome: 'Metal', categoria: 'metal', cor: '#f9a825', simbolo: 'M', icone: '🥫', pontos_acerto: 100 },
  { codigo: 'organico', nome: 'Orgânico', categoria: 'organico', cor: '#6d4c41', simbolo: 'O', icone: '🍂', pontos_acerto: 100 },
];

// referencia_visual:
//   "coco:<classe>"   → classe reconhecida pelo modelo COCO-SSD (câmera)
//   "virtual:<chave>" → resíduo virtual projetado em RA sobre a câmera
const RESIDUOS = [
  // Reconhecíveis pela câmera (visão computacional)
  { nome: 'Garrafa plástica', lixeira: 'plastico', icone: '🧴', referencia_visual: 'coco:bottle',
    explicacao: 'Garrafas PET são de plástico e vão para a lixeira vermelha. Esvazie e, se possível, amasse antes de descartar — isso facilita a triagem e a reciclagem.' },
  { nome: 'Copo descartável', lixeira: 'plastico', icone: '🥤', referencia_visual: 'coco:cup',
    explicacao: 'Copos descartáveis comuns são de plástico (PP ou PS) e vão para a lixeira vermelha. Retire restos de bebida antes do descarte.' },
  { nome: 'Taça de vidro', lixeira: 'vidro', icone: '🍷', referencia_visual: 'coco:wine glass',
    explicacao: 'Vidro vai para a lixeira verde. Se estiver quebrado, embrulhe em jornal ou papelão para proteger quem faz a coleta.' },
  { nome: 'Casca de banana', lixeira: 'organico', icone: '🍌', referencia_visual: 'coco:banana',
    explicacao: 'Restos de frutas são orgânicos (lixeira marrom) e podem virar adubo por compostagem. Eles não são recicláveis como plástico ou papel.' },
  { nome: 'Resto de maçã', lixeira: 'organico', icone: '🍎', referencia_visual: 'coco:apple',
    explicacao: 'Restos de alimentos são orgânicos (lixeira marrom). Misturados aos recicláveis, eles sujam e contaminam os outros materiais.' },
  { nome: 'Casca de laranja', lixeira: 'organico', icone: '🍊', referencia_visual: 'coco:orange',
    explicacao: 'Cascas de frutas são resíduos orgânicos (lixeira marrom) e podem ser transformadas em adubo pela compostagem.' },
  { nome: 'Caderno usado', lixeira: 'papel', icone: '📓', referencia_visual: 'coco:book',
    explicacao: 'Cadernos e livros são de papel e vão para a lixeira azul. Se possível, retire espirais metálicas ou plásticas antes do descarte.' },
  { nome: 'Garfo de metal', lixeira: 'metal', icone: '🍴', referencia_visual: 'coco:fork',
    explicacao: 'Talheres de metal vão para a lixeira amarela. O metal pode ser derretido e reciclado muitas vezes sem perder qualidade.' },
  { nome: 'Colher de metal', lixeira: 'metal', icone: '🥄', referencia_visual: 'coco:spoon',
    explicacao: 'Objetos de metal vão para a lixeira amarela. A reciclagem do metal economiza energia e reduz a mineração.' },
  { nome: 'Tesoura velha', lixeira: 'metal', icone: '✂️', referencia_visual: 'coco:scissors',
    explicacao: 'Tesouras são principalmente de metal e vão para a lixeira amarela. Proteja as pontas para evitar acidentes na coleta.' },

  // Resíduos virtuais (realidade aumentada)
  { nome: 'Lata de alumínio', lixeira: 'metal', icone: '🥫', referencia_visual: 'virtual:lata',
    explicacao: 'Latas de alumínio vão para a lixeira amarela (metal). O alumínio é 100% reciclável e pode voltar às prateleiras em poucas semanas.' },
  { nome: 'Jornal', lixeira: 'papel', icone: '📰', referencia_visual: 'virtual:jornal',
    explicacao: 'Jornais e revistas são papel e vão para a lixeira azul. Mantenha-os secos: papel molhado ou engordurado perde valor de reciclagem.' },
  { nome: 'Caixa de papelão', lixeira: 'papel', icone: '📦', referencia_visual: 'virtual:papelao',
    explicacao: 'Papelão vai para a lixeira azul. Desmonte a caixa para ocupar menos espaço na coleta.' },
  { nome: 'Pote de vidro', lixeira: 'vidro', icone: '🫙', referencia_visual: 'virtual:pote_vidro',
    explicacao: 'Potes de vidro vão para a lixeira verde. Lave rapidamente e separe a tampa, que normalmente é de metal ou plástico.' },
  { nome: 'Garrafa de vidro', lixeira: 'vidro', icone: '🍾', referencia_visual: 'virtual:garrafa_vidro',
    explicacao: 'Garrafas de vidro vão para a lixeira verde. O vidro é 100% reciclável e pode ser reciclado infinitas vezes.' },
  { nome: 'Sacola plástica', lixeira: 'plastico', icone: '🛍️', referencia_visual: 'virtual:sacola',
    explicacao: 'Sacolas plásticas vão para a lixeira vermelha. Melhor ainda: reutilize-as ou prefira sacolas retornáveis.' },
  { nome: 'Frasco de detergente', lixeira: 'plastico', icone: '🧴', referencia_visual: 'virtual:frasco',
    explicacao: 'Frascos de produtos de limpeza são de plástico (lixeira vermelha). Enxágue antes de descartar para não contaminar outros materiais.' },
  { nome: 'Folha de papel', lixeira: 'papel', icone: '📄', referencia_visual: 'virtual:folha',
    explicacao: 'Folhas de papel limpas vão para a lixeira azul. Papéis sujos de gordura ou papel higiênico usado não são recicláveis.' },
  { nome: 'Casca de ovo', lixeira: 'organico', icone: '🥚', referencia_visual: 'virtual:casca_ovo',
    explicacao: 'Cascas de ovo são orgânicas (lixeira marrom) e ótimas para compostagem, pois devolvem cálcio ao solo.' },
  { nome: 'Resto de pão', lixeira: 'organico', icone: '🍞', referencia_visual: 'virtual:pao',
    explicacao: 'Restos de comida são orgânicos e vão para a lixeira marrom. Evitar o desperdício é ainda melhor do que descartar corretamente.' },
  { nome: 'Tampinha metálica', lixeira: 'metal', icone: '🔩', referencia_visual: 'virtual:tampinha',
    explicacao: 'Tampinhas de metal vão para a lixeira amarela. Junte várias em uma lata para que não se percam na triagem.' },
];

module.exports = { LIXEIRAS, RESIDUOS };
