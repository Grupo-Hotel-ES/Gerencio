export type StatusMotoboy = 'disponivel' | 'em_entrega' | 'inativo';

export type Motoboy = {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  status: StatusMotoboy;
  placa?: string;
  entregasHoje: number;
};

export const ROTULOS_STATUS_MOTOBOY: Record<StatusMotoboy, string> = {
  disponivel: 'Disponível',
  em_entrega: 'Em entrega',
  inativo: 'Inativo',
};

// Dados demonstrativos para visualização imediata do dashboard de motoboys.
export const MOTOBOYS_DEMO: Motoboy[] = [
  {
    id: 1,
    nome: 'Carlos Eduardo Silva',
    cpf: '123.456.789-01',
    telefone: '(11) 98765-4321',
    email: 'carlos.silva@email.com',
    status: 'disponivel',
    placa: 'BRA2E19',
    entregasHoje: 6,
  },
  {
    id: 2,
    nome: 'Lucas Santos de Oliveira',
    cpf: '234.567.890-12',
    telefone: '(11) 97654-3210',
    email: 'lucas.oliveira@email.com',
    status: 'em_entrega',
    placa: 'ABC1D23',
    entregasHoje: 9,
  },
  {
    id: 3,
    nome: 'Matheus Pereira Rocha',
    cpf: '345.678.901-23',
    telefone: '(11) 96543-2109',
    email: 'matheus.rocha@email.com',
    status: 'disponivel',
    placa: 'XYZ9K88',
    entregasHoje: 4,
  },
  {
    id: 4,
    nome: 'Rafael Costa Almeida',
    cpf: '456.789.012-34',
    telefone: '(11) 95432-1098',
    email: 'rafael.costa@email.com',
    status: 'inativo',
    placa: 'MOT4X71',
    entregasHoje: 0,
  },
];
