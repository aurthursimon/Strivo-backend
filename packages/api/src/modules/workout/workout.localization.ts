import { normalizeAcceptLanguage } from '../../common/locale/accept-language';

type WorkoutLocale = 'en' | 'pt' | 'es';
type LocalizedText = Record<WorkoutLocale, string>;
type JsonObject = Record<string, unknown>;

const text = (pt: string, en: string, es: string): LocalizedText => ({ pt, en, es });

function localeOf(locale?: string): WorkoutLocale {
  return normalizeAcceptLanguage(locale) ?? 'en';
}

const EXERCISE_NAMES: Record<string, LocalizedText> = {
  'Esteira caminhada inclinada': text(
    'Caminhada inclinada na esteira',
    'Incline treadmill walk',
    'Caminata inclinada en cinta',
  ),
  'Supino maquina': text('Supino na máquina', 'Machine chest press', 'Press de pecho en máquina'),
  'Puxada frente na polia': text(
    'Puxada frontal na polia',
    'Lat pulldown',
    'Jalón frontal en polea',
  ),
  'Leg press 45': text('Leg press 45°', '45-degree leg press', 'Prensa de piernas a 45°'),
  'Mesa flexora': text('Mesa flexora', 'Lying leg curl', 'Curl femoral tumbado'),
  'Desenvolvimento maquina': text(
    'Desenvolvimento na máquina',
    'Machine shoulder press',
    'Press de hombros en máquina',
  ),
  'Prancha abdominal': text('Prancha abdominal', 'Plank', 'Plancha abdominal'),
  'Remada baixa': text('Remada baixa', 'Seated cable row', 'Remo sentado en polea'),
  'Cadeira extensora': text('Cadeira extensora', 'Leg extension', 'Extensión de piernas'),
  'Bicicleta ergometrica': text('Bicicleta ergométrica', 'Stationary bike', 'Bicicleta estática'),
  'Hip thrust': text('Elevação pélvica', 'Hip thrust', 'Hip thrust'),
  'Triceps corda': text(
    'Tríceps na corda',
    'Rope triceps pushdown',
    'Extensión de tríceps con cuerda',
  ),
  'Abdominal maquina': text('Abdominal na máquina', 'Machine crunch', 'Abdominal en máquina'),
  'Face pull na polia': text('Face pull na polia', 'Cable face pull', 'Face pull en polea'),
  'Circuito de mobilidade articular': text(
    'Circuito de mobilidade articular',
    'Joint mobility circuit',
    'Circuito de movilidad articular',
  ),
  'Elevacao lateral': text('Elevação lateral', 'Lateral raise', 'Elevación lateral'),
  'Rosca direta': text('Rosca direta', 'Barbell curl', 'Curl con barra'),
  'Panturrilha em pe maquina': text(
    'Panturrilha em pé na máquina',
    'Standing machine calf raise',
    'Elevación de pantorrillas de pie en máquina',
  ),
  'Crucifixo maquina': text('Crucifixo na máquina', 'Pec deck fly', 'Aperturas en máquina'),
  'Rosca martelo': text('Rosca martelo', 'Hammer curl', 'Curl martillo'),
  'Supino reto com barra': text(
    'Supino reto com barra',
    'Barbell bench press',
    'Press de banca con barra',
  ),
  'Supino inclinado com halteres': text(
    'Supino inclinado com halteres',
    'Incline dumbbell press',
    'Press inclinado con mancuernas',
  ),
  'Crossover na polia': text('Crossover na polia', 'Cable crossover', 'Cruce de poleas'),
  'Remada unilateral com halter': text(
    'Remada unilateral com halter',
    'One-arm dumbbell row',
    'Remo con mancuerna a un brazo',
  ),
  'Agachamento no smith': text(
    'Agachamento no smith',
    'Smith machine squat',
    'Sentadilla en máquina Smith',
  ),
  'Levantamento terra romeno': text(
    'Levantamento terra romeno',
    'Romanian deadlift',
    'Peso muerto rumano',
  ),
  'Mergulho no banco': text('Mergulho no banco', 'Bench triceps dip', 'Fondos de tríceps en banco'),
  'Cadeira abdutora': text('Cadeira abdutora', 'Hip abduction machine', 'Máquina de abductores'),
  'Crucifixo inverso maquina': text(
    'Crucifixo inverso na máquina',
    'Reverse pec deck',
    'Aperturas inversas en máquina',
  ),
  'Caminhada do fazendeiro': text(
    'Caminhada do fazendeiro',
    'Farmer’s carry',
    'Paseo del granjero',
  ),
  'Flexao de bracos': text('Flexão de braços', 'Push-up', 'Flexión de brazos'),
  'Remada curvada com barra': text(
    'Remada curvada com barra',
    'Bent-over barbell row',
    'Remo inclinado con barra',
  ),
  'Caminhada leve': text('Caminhada leve', 'Easy walk', 'Caminata suave'),
  'Caminhada carregando mochila': text(
    'Caminhada carregando mochila',
    'Loaded backpack walk',
    'Caminata con mochila cargada',
  ),
  'Remada maquina apoiada': text(
    'Remada apoiada na máquina',
    'Chest-supported machine row',
    'Remo con apoyo en máquina',
  ),
  'Dead bug': text('Dead bug', 'Dead bug', 'Dead bug'),
  'Agachamento goblet': text('Agachamento goblet', 'Goblet squat', 'Sentadilla goblet'),
  'Eliptico intervalado leve': text(
    'Elíptico intervalado leve',
    'Easy elliptical intervals',
    'Intervalos suaves en elíptica',
  ),
  'Simulador de escada': text('Simulador de escada', 'Stair climber', 'Simulador de escaleras'),
  'Prancha lateral': text('Prancha lateral', 'Side plank', 'Plancha lateral'),
  'Remo ergometro tecnico': text(
    'Remo ergômetro técnico',
    'Technique-focused rowing machine',
    'Remo ergómetro técnico',
  ),
  'Gluteo na polia': text('Glúteo na polia', 'Cable glute kickback', 'Patada de glúteo en polea'),
  'Step-up no banco': text('Subida no banco', 'Bench step-up', 'Subida al banco'),
  'Triceps overhead na corda': text(
    'Tríceps acima da cabeça na corda',
    'Overhead rope triceps extension',
    'Extensión de tríceps sobre la cabeza con cuerda',
  ),
  'Barra fixa assistida': text('Barra fixa assistida', 'Assisted pull-up', 'Dominada asistida'),
  'Pulldown braco estendido': text(
    'Pulldown com braços estendidos',
    'Straight-arm pulldown',
    'Jalón con brazos extendidos',
  ),
  'Rosca scott maquina': text(
    'Rosca Scott na máquina',
    'Machine preacher curl',
    'Curl predicador en máquina',
  ),
  'Hack machine': text('Agachamento hack', 'Hack squat', 'Sentadilla hack'),
  'Passada caminhando': text('Passada caminhando', 'Walking lunge', 'Zancadas caminando'),
  'Cadeira adutora': text('Cadeira adutora', 'Hip adduction machine', 'Máquina de aductores'),
  'Woodchop na polia': text('Woodchop na polia', 'Cable woodchop', 'Leñador en polea'),
  'Agachamento livre peso corporal': text(
    'Agachamento livre com peso corporal',
    'Bodyweight squat',
    'Sentadilla con peso corporal',
  ),
  'Afundo reverso': text('Afundo reverso', 'Reverse lunge', 'Zancada inversa'),
  'Caminhada em ritmo moderado': text(
    'Caminhada em ritmo moderado',
    'Moderate-paced walk',
    'Caminata a ritmo moderado',
  ),
  'Mountain climber controlado': text(
    'Mountain climber controlado',
    'Controlled mountain climber',
    'Escalador controlado',
  ),
  'Caminhada continua': text('Caminhada contínua', 'Continuous walk', 'Caminata continua'),
  'Caminhada leve de recuperacao': text(
    'Caminhada leve de recuperação',
    'Easy recovery walk',
    'Caminata suave de recuperación',
  ),
  'Fluxo de mobilidade dinamica': text(
    'Fluxo de mobilidade dinâmica',
    'Dynamic mobility flow',
    'Flujo de movilidad dinámica',
  ),
  'Polichinelo baixo impacto': text(
    'Polichinelo de baixo impacto',
    'Low-impact jack',
    'Salto de tijera de bajo impacto',
  ),
  'Marcha com joelhos altos': text(
    'Marcha com joelhos altos',
    'High-knee march',
    'Marcha con rodillas altas',
  ),
  'Caminhada estacionaria': text('Caminhada estacionária', 'March in place', 'Marcha en el sitio'),
  'Toque lateral em pe': text('Toque lateral em pé', 'Standing side step', 'Paso lateral de pie'),
  'Ponte de gluteos no solo': text(
    'Ponte de glúteos no solo',
    'Floor glute bridge',
    'Puente de glúteos en el suelo',
  ),
  'Elevacao de panturrilhas no solo': text(
    'Elevação de panturrilhas no solo',
    'Bodyweight calf raise',
    'Elevación de pantorrillas con peso corporal',
  ),
  'Elevacao unilateral de panturrilha': text(
    'Elevação unilateral de panturrilha',
    'Single-leg calf raise',
    'Elevación unilateral de pantorrilla',
  ),
  'Supino em pe com elastico': text(
    'Supino em pé com elástico',
    'Standing band chest press',
    'Press de pecho de pie con banda',
  ),
  'Flexao com elastico': text(
    'Flexão com elástico',
    'Band-resisted push-up',
    'Flexión con banda elástica',
  ),
  'Remada sentada com elastico': text(
    'Remada sentada com elástico',
    'Seated band row',
    'Remo sentado con banda',
  ),
  'Abertura com elastico': text(
    'Abertura com elástico',
    'Band pull-apart',
    'Apertura con banda elástica',
  ),
  'Agachamento com elastico': text(
    'Agachamento com elástico',
    'Band squat',
    'Sentadilla con banda',
  ),
  'Caminhada lateral com elastico': text(
    'Caminhada lateral com elástico',
    'Lateral band walk',
    'Caminata lateral con banda',
  ),
  'Levantamento terra com elastico': text(
    'Levantamento terra com elástico',
    'Band deadlift',
    'Peso muerto con banda',
  ),
  'Press anti-rotacao com elastico': text(
    'Press anti-rotação com elástico',
    'Band anti-rotation press',
    'Press anti-rotación con banda',
  ),
  'Rotacao diagonal com elastico': text(
    'Rotação diagonal com elástico',
    'Band diagonal rotation',
    'Rotación diagonal con banda',
  ),
};

const ALTERNATIVE_NAMES: Record<string, LocalizedText> = {
  'abdominal cabo': text('abdominal na polia', 'cable crunch', 'abdominal en polea'),
  'abdominal maquina': text('abdominal na máquina', 'machine crunch', 'abdominal en máquina'),
  'abducao na polia': text(
    'abdução na polia',
    'cable hip abduction',
    'abducción de cadera en polea',
  ),
  'aducao na polia': text('adução na polia', 'cable hip adduction', 'aducción de cadera en polea'),
  'afundo no smith': text('afundo no smith', 'Smith machine lunge', 'zancada en máquina Smith'),
  'agachamento goblet': text('agachamento goblet', 'goblet squat', 'sentadilla goblet'),
  'agachamento smith': text(
    'agachamento no smith',
    'Smith machine squat',
    'sentadilla en máquina Smith',
  ),
  'agachamento sumo leve': text(
    'agachamento sumô leve',
    'light sumo squat',
    'sentadilla sumo ligera',
  ),
  'alongamento dinamico': text(
    'alongamento dinâmico',
    'dynamic stretching',
    'estiramiento dinámico',
  ),
  'aquecimento na esteira': text(
    'aquecimento na esteira',
    'treadmill warm-up',
    'calentamiento en cinta',
  ),
  'barra assistida': text('barra fixa assistida', 'assisted pull-up', 'dominada asistida'),
  'bicicleta ergometrica': text('bicicleta ergométrica', 'stationary bike', 'bicicleta estática'),
  bike: text('bicicleta', 'stationary bike', 'bicicleta estática'),
  'bike intervalada': text('bicicleta intervalada', 'bike intervals', 'intervalos en bicicleta'),
  'bird dog': text('bird dog', 'bird dog', 'bird dog'),
  'bodyweight squat': text(
    'agachamento com peso corporal',
    'bodyweight squat',
    'sentadilla con peso corporal',
  ),
  'bom dia leve': text('bom dia leve', 'light good morning', 'buenos días ligero'),
  'cadeira abdutora': text('cadeira abdutora', 'hip abduction machine', 'máquina de abductores'),
  'cadeira extensora': text('cadeira extensora', 'leg extension', 'extensión de piernas'),
  'cadeira flexora': text('cadeira flexora', 'seated leg curl', 'curl femoral sentado'),
  'caminhada no solo': text('caminhada no solo', 'ground walking', 'caminata en suelo'),
  'caminhada unilateral': text(
    'caminhada unilateral',
    'single-arm carry',
    'caminata con carga unilateral',
  ),
  'crossover baixo': text('crossover baixo', 'low cable crossover', 'cruce de poleas bajo'),
  'crossover polia': text('crossover na polia', 'cable crossover', 'cruce de poleas'),
  'crucifixo com halteres': text(
    'crucifixo com halteres',
    'dumbbell fly',
    'aperturas con mancuernas',
  ),
  'crucifixo halteres': text('crucifixo com halteres', 'dumbbell fly', 'aperturas con mancuernas'),
  'crucifixo inverso': text('crucifixo inverso', 'reverse fly', 'aperturas inversas'),
  'crucifixo inverso halteres': text(
    'crucifixo inverso com halteres',
    'reverse dumbbell fly',
    'aperturas inversas con mancuernas',
  ),
  'crucifixo maquina': text('crucifixo na máquina', 'pec deck fly', 'aperturas en máquina'),
  'crunch no solo': text('abdominal no solo', 'floor crunch', 'abdominal en el suelo'),
  'dead bug': text('dead bug', 'dead bug', 'dead bug'),
  'desenvolvimento barra': text(
    'desenvolvimento com barra',
    'barbell shoulder press',
    'press de hombros con barra',
  ),
  'desenvolvimento halteres': text(
    'desenvolvimento com halteres',
    'dumbbell shoulder press',
    'press de hombros con mancuernas',
  ),
  'desenvolvimento maquina': text(
    'desenvolvimento na máquina',
    'machine shoulder press',
    'press de hombros en máquina',
  ),
  'elastico pull apart': text(
    'abertura com elástico',
    'band pull-apart',
    'apertura con banda elástica',
  ),
  'elevacao lateral': text('elevação lateral', 'lateral raise', 'elevación lateral'),
  'elevacao lateral maquina': text(
    'elevação lateral na máquina',
    'machine lateral raise',
    'elevación lateral en máquina',
  ),
  'elevacao na polia': text('elevação na polia', 'cable raise', 'elevación en polea'),
  eliptico: text('elíptico', 'elliptical', 'elíptica'),
  elastico: text('elástico', 'resistance band', 'banda elástica'),
  esteira: text('esteira', 'treadmill', 'cinta'),
  'esteira inclinada': text('esteira inclinada', 'incline treadmill', 'cinta inclinada'),
  'face pull': text('face pull', 'face pull', 'face pull'),
  'flexao de bracos': text('flexão de braços', 'push-up', 'flexión de brazos'),
  'flexao fechada': text('flexão fechada', 'close-grip push-up', 'flexión con agarre cerrado'),
  'flexao inclinada': text('flexão inclinada', 'incline push-up', 'flexión inclinada'),
  'gluteo maquina': text(
    'glúteo na máquina',
    'machine glute kickback',
    'patada de glúteo en máquina',
  ),
  'gluteo na polia': text('glúteo na polia', 'cable glute kickback', 'patada de glúteo en polea'),
  'goblet squat': text('agachamento goblet', 'goblet squat', 'sentadilla goblet'),
  'hack machine': text('agachamento hack', 'hack squat', 'sentadilla hack'),
  'hip thrust': text('elevação pélvica', 'hip thrust', 'hip thrust'),
  'leg press': text('leg press', 'leg press', 'prensa de piernas'),
  'levantamento terra romeno': text(
    'levantamento terra romeno',
    'Romanian deadlift',
    'peso muerto rumano',
  ),
  'mergulho no banco': text('mergulho no banco', 'bench triceps dip', 'fondos de tríceps en banco'),
  'mesa flexora': text('mesa flexora', 'lying leg curl', 'curl femoral tumbado'),
  'mini band lateral': text(
    'passos laterais com miniband',
    'lateral miniband walk',
    'pasos laterales con minibanda',
  ),
  'mobilidade com bastao': text('mobilidade com bastão', 'stick mobility', 'movilidad con bastón'),
  'pallof press': text('Pallof press', 'Pallof press', 'press Pallof'),
  'panturrilha no leg press': text(
    'panturrilha no leg press',
    'leg press calf raise',
    'elevación de pantorrillas en prensa',
  ),
  'panturrilha sentada': text(
    'panturrilha sentada',
    'seated calf raise',
    'elevación de pantorrillas sentado',
  ),
  'panturrilha unilateral': text(
    'panturrilha unilateral',
    'single-leg calf raise',
    'elevación de pantorrilla unilateral',
  ),
  passada: text('passada', 'lunge', 'zancada'),
  'passada caminhando': text('passada caminhando', 'walking lunge', 'zancadas caminando'),
  'polichinelo baixo impacto': text(
    'polichinelo de baixo impacto',
    'low-impact jumping jack',
    'salto de tijera de bajo impacto',
  ),
  'ponte com bola': text('ponte com bola', 'ball glute bridge', 'puente de glúteos con pelota'),
  'ponte de gluteos': text('ponte de glúteos', 'glute bridge', 'puente de glúteos'),
  prancha: text('prancha', 'plank', 'plancha'),
  'prancha frontal': text('prancha frontal', 'front plank', 'plancha frontal'),
  'prancha joelhos': text(
    'prancha com joelhos apoiados',
    'kneeling plank',
    'plancha con rodillas apoyadas',
  ),
  'prancha lateral': text('prancha lateral', 'side plank', 'plancha lateral'),
  'pulldown neutro': text(
    'pulldown com pegada neutra',
    'neutral-grip pulldown',
    'jalón con agarre neutro',
  ),
  'pullover maquina': text('pullover na máquina', 'machine pullover', 'pullover en máquina'),
  'puxada frente': text('puxada frontal', 'lat pulldown', 'jalón frontal'),
  'remada alta leve': text('remada alta leve', 'light upright row', 'remo al mentón ligero'),
  'remada baixa': text('remada baixa', 'seated cable row', 'remo sentado en polea'),
  'remada cavalinho': text('remada cavalinho', 'T-bar row', 'remo con barra T'),
  'remada curvada': text('remada curvada', 'bent-over row', 'remo inclinado'),
  'remada maquina': text('remada na máquina', 'machine row', 'remo en máquina'),
  'remada unilateral': text('remada unilateral', 'one-arm row', 'remo a un brazo'),
  'remo ergometro': text('remo ergômetro', 'rowing machine', 'remo ergómetro'),
  'rosca alternada': text('rosca alternada', 'alternating curl', 'curl alterno'),
  'rosca cabo': text('rosca na polia', 'cable curl', 'curl en polea'),
  'rosca corda': text('rosca na corda', 'rope hammer curl', 'curl martillo con cuerda'),
  'rosca direta': text('rosca direta', 'barbell curl', 'curl con barra'),
  'rosca maquina': text('rosca na máquina', 'machine curl', 'curl en máquina'),
  'sentar e levantar da cadeira': text(
    'sentar e levantar da cadeira',
    'sit-to-stand',
    'sentarse y levantarse de la silla',
  ),
  'step-up': text('subida no banco', 'step-up', 'subida al banco'),
  'stiff romeno': text('stiff romeno', 'Romanian deadlift', 'peso muerto rumano'),
  'supino com halteres': text(
    'supino com halteres',
    'dumbbell bench press',
    'press de banca con mancuernas',
  ),
  'supino halteres': text(
    'supino com halteres',
    'dumbbell bench press',
    'press de banca con mancuernas',
  ),
  'supino inclinado maquina': text(
    'supino inclinado na máquina',
    'incline machine press',
    'press inclinado en máquina',
  ),
  'supino maquina': text('supino na máquina', 'machine chest press', 'press de pecho en máquina'),
  'supino reto': text('supino reto', 'bench press', 'press de banca'),
  'supino reto com barra': text(
    'supino reto com barra',
    'barbell bench press',
    'press de banca con barra',
  ),
  'triceps barra': text(
    'tríceps na barra',
    'bar triceps pushdown',
    'extensión de tríceps con barra',
  ),
  'triceps corda': text(
    'tríceps na corda',
    'rope triceps pushdown',
    'extensión de tríceps con cuerda',
  ),
  'triceps maquina': text(
    'tríceps na máquina',
    'machine triceps extension',
    'extensión de tríceps en máquina',
  ),
  'triceps testa': text('tríceps testa', 'lying triceps extension', 'extensión de tríceps tumbado'),
};

const TERMS: Record<string, LocalizedText> = {
  abdomen: text('abdômen', 'abs', 'abdomen'),
  adutores: text('adutores', 'adductors', 'aductores'),
  antebraco: text('antebraço', 'forearms', 'antebrazos'),
  biceps: text('bíceps', 'biceps', 'bíceps'),
  braquial: text('braquial', 'brachialis', 'braquial'),
  cardio: text('cardio', 'cardio', 'cardio'),
  core: text('core', 'core', 'core'),
  costas: text('costas', 'back', 'espalda'),
  'gluteo medio': text('glúteo médio', 'gluteus medius', 'glúteo medio'),
  gluteos: text('glúteos', 'glutes', 'glúteos'),
  lombar: text('lombar', 'lower back', 'zona lumbar'),
  manguito: text('manguito rotador', 'rotator cuff', 'manguito rotador'),
  mobilidade: text('mobilidade', 'mobility', 'movilidad'),
  obliquos: text('oblíquos', 'obliques', 'oblicuos'),
  'ombro posterior': text('ombro posterior', 'rear deltoids', 'deltoides posteriores'),
  ombros: text('ombros', 'shoulders', 'hombros'),
  panturrilhas: text('panturrilhas', 'calves', 'pantorrillas'),
  peito: text('peito', 'chest', 'pecho'),
  'peito superior': text('peito superior', 'upper chest', 'pecho superior'),
  pernas: text('pernas', 'legs', 'piernas'),
  posterior: text('cadeia posterior', 'posterior chain', 'cadena posterior'),
  'posterior de coxa': text('posterior de coxa', 'hamstrings', 'isquiotibiales'),
  quadriceps: text('quadríceps', 'quadriceps', 'cuádriceps'),
  quadril: text('quadril', 'hips', 'caderas'),
  serratus: text('serrátil', 'serratus', 'serrato'),
  trapezio: text('trapézio', 'trapezius', 'trapecio'),
  triceps: text('tríceps', 'triceps', 'tríceps'),
  banco: text('banco', 'bench', 'banco'),
  'banco inclinado': text('banco inclinado', 'incline bench', 'banco inclinado'),
  barra: text('barra', 'barbell', 'barra'),
  bicicleta: text('bicicleta', 'stationary bike', 'bicicleta estática'),
  'cadeira estavel': text('cadeira estável', 'stable chair', 'silla estable'),
  colchonete: text('colchonete', 'exercise mat', 'colchoneta'),
  corda: text('corda', 'rope attachment', 'cuerda'),
  eliptico: text('elíptico', 'elliptical', 'elíptica'),
  esteira: text('esteira', 'treadmill', 'cinta'),
  'hack machine': text('máquina hack', 'hack squat machine', 'máquina hack'),
  halter: text('halter', 'dumbbell', 'mancuerna'),
  halteres: text('halteres', 'dumbbells', 'mancuernas'),
  kettlebell: text('kettlebell', 'kettlebell', 'kettlebell'),
  'leg press': text('leg press', 'leg press', 'prensa de piernas'),
  maquina: text('máquina', 'machine', 'máquina'),
  'maquina assistida': text('máquina assistida', 'assisted machine', 'máquina asistida'),
  mochila: text('mochila', 'backpack', 'mochila'),
  'peso corporal': text('peso corporal', 'bodyweight', 'peso corporal'),
  polia: text('polia', 'cable machine', 'polea'),
  'remo ergometro': text('remo ergômetro', 'rowing machine', 'remo ergómetro'),
  'simulador de escada': text('simulador de escada', 'stair climber', 'simulador de escaleras'),
  smith: text('máquina Smith', 'Smith machine', 'máquina Smith'),
  tornozeleira: text('tornozeleira', 'ankle strap', 'tobillera'),
};

const PLAN_NAMES: Record<string, LocalizedText> = {
  'Adaptacao Academia 1x Semana': text(
    'Adaptação na academia — 1x por semana',
    'Gym adaptation — once a week',
    'Adaptación en gimnasio — una vez por semana',
  ),
  'Adaptacao Academia 2x Semana': text(
    'Adaptação na academia — 2x por semana',
    'Gym adaptation — twice a week',
    'Adaptación en gimnasio — dos veces por semana',
  ),
  'Adaptacao Academia 3x Semana': text(
    'Adaptação na academia — 3x por semana',
    'Gym adaptation — three times a week',
    'Adaptación en gimnasio — tres veces por semana',
  ),
  'ABC Iniciante 3x Semana': text(
    'ABC iniciante — 3x por semana',
    'Beginner ABC split — three times a week',
    'Rutina ABC principiante — tres veces por semana',
  ),
  'ABC Hipertrofia Intermediario 3x Semana': text(
    'ABC hipertrofia intermediário — 3x por semana',
    'Intermediate hypertrophy ABC split — three times a week',
    'Rutina ABC de hipertrofia intermedia — tres veces por semana',
  ),
  'Upper Lower 4x Semana': text(
    'Superiores e inferiores — 4x por semana',
    'Upper/lower split — four times a week',
    'Rutina de tren superior y tren inferior — cuatro veces por semana',
  ),
  'ABCD Intermediario 4x Semana': text(
    'ABCD intermediário — 4x por semana',
    'Intermediate ABCD split — four times a week',
    'Rutina ABCD intermedia — cuatro veces por semana',
  ),
  'Foco Pernas e Gluteos 4x Semana': text(
    'Foco em pernas e glúteos — 4x por semana',
    'Leg and glute focus — four times a week',
    'Enfoque en piernas y glúteos — cuatro veces por semana',
  ),
  'ABCDE Avancado 5x Semana': text(
    'ABCDE avançado — 5x por semana',
    'Advanced ABCDE split — five times a week',
    'Rutina ABCDE avanzada — cinco veces por semana',
  ),
  'ABC 2x Avancado 6x Semana': text(
    'ABC duplo avançado — 6x por semana',
    'Advanced double ABC split — six times a week',
    'Rutina ABC doble avanzada — seis veces por semana',
  ),
  'Condicionamento Academia 3x Semana': text(
    'Condicionamento na academia — 3x por semana',
    'Gym conditioning — three times a week',
    'Acondicionamiento en gimnasio — tres veces por semana',
  ),
  'Full Body Forca 3x Semana': text(
    'Força de corpo inteiro — 3x por semana',
    'Full-body strength — three times a week',
    'Fuerza de cuerpo completo — tres veces por semana',
  ),
  'Foco Superiores Hipertrofia 4x Semana': text(
    'Hipertrofia com foco em superiores — 4x por semana',
    'Upper-body hypertrophy focus — four times a week',
    'Hipertrofia con enfoque en tren superior — cuatro veces por semana',
  ),
  'Adaptacao Casa 2x Semana': text(
    'Adaptação em casa — 2x por semana',
    'Home adaptation — twice a week',
    'Adaptación en casa — dos veces por semana',
  ),
  'Full Body Iniciante Academia 2x Semana': text(
    'Corpo inteiro iniciante na academia — 2x por semana',
    'Beginner full-body gym plan — twice a week',
    'Cuerpo completo principiante en gimnasio — dos veces por semana',
  ),
  'Full Body Condicionamento Academia 4x Semana': text(
    'Condicionamento de corpo inteiro na academia — 4x por semana',
    'Full-body gym conditioning — four times a week',
    'Acondicionamiento de cuerpo completo en gimnasio — cuatro veces por semana',
  ),
  'ABC Gluteos e Core 3x Semana': text(
    'ABC glúteos e core — 3x por semana',
    'Glute and core ABC split — three times a week',
    'Rutina ABC de glúteos y core — tres veces por semana',
  ),
  'Push Pull Legs Intermediario 5x Semana': text(
    'Push, pull e legs intermediário — 5x por semana',
    'Intermediate push/pull/legs — five times a week',
    'Push/pull/legs intermedio — cinco veces por semana',
  ),
  'Upper Lower Forca 4x Semana': text(
    'Força de superiores e inferiores — 4x por semana',
    'Upper/lower strength — four times a week',
    'Fuerza de tren superior y tren inferior — cuatro veces por semana',
  ),
  'Full Body Casa Peso Corporal 3x Semana': text(
    'Corpo inteiro em casa com peso corporal — 3x por semana',
    'At-home bodyweight full body — three times a week',
    'Cuerpo completo en casa con peso corporal — tres veces por semana',
  ),
  'Condicionamento Casa 4x Semana': text(
    'Condicionamento em casa — 4x por semana',
    'Home conditioning — four times a week',
    'Acondicionamiento en casa — cuatro veces por semana',
  ),
  'Mobilidade e Recuperacao 2x Semana': text(
    'Mobilidade e recuperação — 2x por semana',
    'Mobility and recovery — twice a week',
    'Movilidad y recuperación — dos veces por semana',
  ),
  'Posterior e Gluteos Avancado 5x Semana': text(
    'Posterior e glúteos avançado — 5x por semana',
    'Advanced hamstring and glute focus — five times a week',
    'Enfoque avanzado en isquiotibiales y glúteos — cinco veces por semana',
  ),
  'AB Alternado Academia 2x Semana': text(
    'AB alternado na academia — 2x por semana',
    'Alternating gym AB split — twice a week',
    'Rutina AB alternada en gimnasio — dos veces por semana',
  ),
  'Push Pull Legs Academia 3x Semana': text(
    'Push, pull e legs na academia — 3x por semana',
    'Gym push/pull/legs — three times a week',
    'Push/pull/legs en gimnasio — tres veces por semana',
  ),
  'AB Alternado Casa 2x Semana': text(
    'AB alternado em casa — 2x por semana',
    'Alternating home AB split — twice a week',
    'Rutina AB alternada en casa — dos veces por semana',
  ),
  'Full Body Casa com Halteres 3x Semana': text(
    'Corpo inteiro em casa com halteres — 3x por semana',
    'At-home dumbbell full body — three times a week',
    'Cuerpo completo en casa con mancuernas — tres veces por semana',
  ),
  'Full Body Casa com Elasticos 3x Semana': text(
    'Corpo inteiro em casa com elásticos — 3x por semana',
    'At-home resistance-band full body — three times a week',
    'Cuerpo completo en casa con bandas elásticas — tres veces por semana',
  ),
};

function polishPortuguese(value: unknown): string {
  let result = String(value ?? '');
  const replacements: Array<[RegExp, string]> = [
    [/\bnao\b/gi, 'não'],
    [/\bmaos\b/gi, 'mãos'],
    [/\bbracos\b/gi, 'braços'],
    [/\bcabeca\b/gi, 'cabeça'],
    [/\bposicao\b/gi, 'posição'],
    [/\brepeticao/gi, 'repetição'],
    [/\brepeticoes\b/gi, 'repetições'],
    [/\badaptacao\b/gi, 'adaptação'],
    [/\binclinacao\b/gi, 'inclinação'],
    [/\btransicao/gi, 'transição'],
    [/\bintensidade\b/gi, 'intensidade'],
    [/\bintermediario\b/gi, 'intermediário'],
    [/\bavancado\b/gi, 'avançado'],
    [/\bforca\b/gi, 'força'],
    [/\brecuperacao\b/gi, 'recuperação'],
    [/\bmanutencao\b/gi, 'manutenção'],
    [/\bcontracao\b/gi, 'contração'],
    [/\bextensao\b/gi, 'extensão'],
    [/\bflexao\b/gi, 'flexão'],
    [/\brotacao\b/gi, 'rotação'],
    [/\bdirecao\b/gi, 'direção'],
    [/\bregule\b/gi, 'regule'],
    [/\bestavel\b/gi, 'estável'],
    [/\bestaveis\b/gi, 'estáveis'],
    [/\bproxima\b/gi, 'próxima'],
    [/\bpropria\b/gi, 'própria'],
    [/\bso\b/gi, 'só'],
    [/\batras\b/gi, 'atrás'],
    [/\bfrente\b/gi, 'frente'],
    [/\btornozelo(s)?\b/gi, 'tornozelo$1'],
    [/\bcalcanhar(es)?\b/gi, 'calcanhar$1'],
    [/\bcoluna\b/gi, 'coluna'],
    [/\brespiracao\b/gi, 'respiração'],
    [/\bexecucao\b/gi, 'execução'],
    [/\btecnica\b/gi, 'técnica'],
    [/\bcadencia\b/gi, 'cadência'],
    [/\bconfortavel\b/gi, 'confortável'],
    [/\bpossivel\b/gi, 'possível'],
    [/\bproximo\b/gi, 'próximo'],
    [/\bjoelho(s)?\b/gi, 'joelho$1'],
    [/\bquadriceps\b/gi, 'quadríceps'],
    [/\bgluteo(s)?\b/gi, 'glúteo$1'],
    [/\bbiceps\b/gi, 'bíceps'],
    [/\btriceps\b/gi, 'tríceps'],
    [/\babdomen\b/gi, 'abdômen'],
    [/\blombar\b/gi, 'lombar'],
    [/\bescapas\b/gi, 'escápulas'],
    [/\bcotovelos\b/gi, 'cotovelos'],
    [/\bserie(s)?\b/gi, 'série$1'],
    [/\bmaxima\b/gi, 'máxima'],
    [/\bminima\b/gi, 'mínima'],
    [/\brapido\b/gi, 'rápido'],
    [/\balcas\b/gi, 'alças'],
    [/\btoracica\b/gi, 'torácica'],
    [/\bdinamico\b/gi, 'dinâmico'],
    [/\bpe(s)?\b/gi, 'pé$1'],
  ];
  for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);
  return result;
}

function translatePlanLabel(value: unknown, locale: WorkoutLocale): string {
  const canonical = String(value ?? '');
  const planName = PLAN_NAMES[canonical];
  if (planName) return planName[locale];
  const source = polishPortuguese(value);
  if (locale === 'pt') return source;
  const dictionary: Array<[RegExp, string, string]> = [
    [/adaptação/gi, 'adaptation', 'adaptación'],
    [/academia/gi, 'gym', 'gimnasio'],
    [/semana/gi, 'week', 'semana'],
    [/iniciante/gi, 'beginner', 'principiante'],
    [/intermediário/gi, 'intermediate', 'intermedio'],
    [/avançado/gi, 'advanced', 'avanzado'],
    [/hipertrofia/gi, 'hypertrophy', 'hipertrofia'],
    [/condicionamento/gi, 'conditioning', 'acondicionamiento'],
    [/força/gi, 'strength', 'fuerza'],
    [/foco/gi, 'focus', 'enfoque'],
    [/casa/gi, 'home', 'casa'],
    [/com halteres/gi, 'with dumbbells', 'con mancuernas'],
    [/corpo todo/gi, 'full body', 'cuerpo completo'],
    [/corpo inteiro/gi, 'full body', 'cuerpo completo'],
    [/peito/gi, 'chest', 'pecho'],
    [/costas/gi, 'back', 'espalda'],
    [/ombros/gi, 'shoulders', 'hombros'],
    [/pernas/gi, 'legs', 'piernas'],
    [/glúteos/gi, 'glutes', 'glúteos'],
    [/posterior de coxa/gi, 'hamstrings', 'isquiotibiales'],
    [/posterior/gi, 'posterior chain', 'cadena posterior'],
    [/quadríceps/gi, 'quadriceps', 'cuádriceps'],
    [/panturrilhas/gi, 'calves', 'pantorrillas'],
    [/braços/gi, 'arms', 'brazos'],
    [/abdômen/gi, 'abs', 'abdomen'],
    [/superiores/gi, 'upper body', 'tren superior'],
    [/inferiores/gi, 'lower body', 'tren inferior'],
    [/empurrar/gi, 'push', 'empuje'],
    [/puxar/gi, 'pull', 'tirón'],
    [/agachamento/gi, 'squat', 'sentadilla'],
    [/mobilidade/gi, 'mobility', 'movilidad'],
    [/recuperação/gi, 'recovery', 'recuperación'],
    [/estabilidade/gi, 'stability', 'estabilidad'],
    [/leve/gi, 'easy', 'suave'],
    [/pesado/gi, 'heavy', 'pesado'],
    [/volume/gi, 'volume', 'volumen'],
    [/técnico/gi, 'technique', 'técnico'],
    [/manutenção/gi, 'maintenance', 'mantenimiento'],
    [/\be\b/gi, 'and', 'y'],
    [/\bcom\b/gi, 'with', 'con'],
    [/\bde\b/gi, 'of', 'de'],
    [/\bna\b/gi, 'in the', 'en el'],
    [/\bno\b/gi, 'in the', 'en el'],
  ];
  let result = source;
  for (const [pattern, en, es] of dictionary)
    result = result.replace(pattern, locale === 'en' ? en : es);
  return result;
}

function localizedGuidance(
  exercise: JsonObject,
  name: string,
  locale: WorkoutLocale,
  muscles: string[],
  equipment: string[],
) {
  if (locale === 'pt') {
    return {
      instructions: polishPortuguese(exercise.instructions),
      setup: polishPortuguese(exercise.setup),
      execution: polishPortuguese(exercise.execution),
      breathing: polishPortuguese(exercise.breathing),
      tempo: polishPortuguese(exercise.tempo),
      targetRpe: polishPortuguese(exercise.targetRpe),
      commonMistakes: Array.isArray(exercise.commonMistakes)
        ? exercise.commonMistakes.map(polishPortuguese)
        : [],
      progression: polishPortuguese(exercise.progression),
      safetyNotes: Array.isArray(exercise.safetyNotes)
        ? exercise.safetyNotes.map(polishPortuguese)
        : [],
    };
  }

  const muscleList =
    muscles.join(', ') || (locale === 'en' ? 'the target muscles' : 'los músculos objetivo');
  const equipmentList =
    equipment.join(', ') ||
    (locale === 'en' ? 'a clear training area' : 'un área de entrenamiento despejada');
  const category = String(exercise.category ?? 'STRENGTH');
  const isCardio = category === 'CARDIO' || category === 'HIIT';
  const isMobility = category === 'FLEXIBILITY' || category === 'RECOVERY';

  return {
    instructions:
      locale === 'en'
        ? `Perform ${name} to train ${muscleList}, following the prescribed sets, repetitions, or duration with a pain-free range.`
        : `Realiza ${name} para trabajar ${muscleList}, respetando las series, repeticiones o la duración indicadas y un rango sin dolor.`,
    setup:
      locale === 'en'
        ? `Prepare ${equipmentList}, establish a stable starting position for ${name}, and confirm a comfortable range before beginning.`
        : `Prepara ${equipmentList}, adopta una posición inicial estable para ${name} y comprueba un rango cómodo antes de comenzar.`,
    execution: isCardio
      ? locale === 'en'
        ? `Keep a steady, technically controlled rhythm during ${name}; reduce intensity before posture or breathing deteriorates.`
        : `Mantén un ritmo constante y técnicamente controlado durante ${name}; reduce la intensidad antes de perder la postura o el control respiratorio.`
      : isMobility
        ? locale === 'en'
          ? `Move slowly through ${name}, increasing range only while ${muscleList} remain controlled and pain-free.`
          : `Muévete lentamente durante ${name}, aumentando el rango solo mientras ${muscleList} permanezcan controlados y sin dolor.`
        : locale === 'en'
          ? `Keep ${muscleList} aligned and engaged, control both phases of ${name}, and never use momentum to finish a repetition.`
          : `Mantén ${muscleList} alineados y activos, controla ambas fases de ${name} y no uses impulso para completar una repetición.`,
    breathing: text(
      'Expire durante o esforço e inspire no retorno, sem prender a respiração.',
      isCardio
        ? 'Breathe continuously at a rhythm that matches the effort; lower the intensity if you cannot control your breathing.'
        : 'Exhale during the effort and inhale on the return without holding your breath.',
      isCardio
        ? 'Respira de forma continua al ritmo del esfuerzo; reduce la intensidad si no puedes controlar la respiración.'
        : 'Exhala durante el esfuerzo e inhala al regresar, sin contener la respiración.',
    )[locale],
    commonMistakes: text(
      'usar impulso|perder o alinhamento|avançar com dor ou fadiga excessiva',
      'using momentum|losing alignment|continuing through pain or excessive fatigue',
      'usar impulso|perder la alineación|continuar con dolor o fatiga excesiva',
    )[locale].split('|'),
    progression: text(
      'Aumente a carga, as repetições ou a duração gradualmente, somente após concluir a prescrição com técnica estável.',
      'Increase load, repetitions, or duration gradually only after completing the prescription with stable technique.',
      'Aumenta la carga, las repeticiones o la duración de forma gradual, solo después de completar la prescripción con una técnica estable.',
    )[locale],
    tempo: text(
      '',
      isCardio
        ? 'Use a continuous rhythm with smooth intensity transitions.'
        : isMobility
          ? 'Move slowly, taking 2–3 seconds per phase without pain.'
          : 'Lower for 2 seconds, pause briefly under control, then rise firmly.',
      isCardio
        ? 'Usa un ritmo continuo con transiciones suaves de intensidad.'
        : isMobility
          ? 'Muévete lentamente, con 2–3 segundos por fase y sin dolor.'
          : 'Baja durante 2 segundos, haz una pausa breve con control y sube con firmeza.',
    )[locale],
    safetyNotes: [
      text(
        'Pare se sentir dor, tontura, falta de ar incomum ou qualquer mal-estar.',
        'Stop if you feel pain, dizziness, unusual shortness of breath, or any discomfort.',
        'Detente si sientes dolor, mareo, falta de aire inusual o cualquier malestar.',
      )[locale],
    ],
  };
}

function localizeExercise(exercise: JsonObject, locale: WorkoutLocale): JsonObject {
  const canonicalName = String(exercise.name ?? '');
  const translatedName = EXERCISE_NAMES[canonicalName];
  if (!translatedName) return exercise;
  const name = translatedName[locale];
  const translateTerms = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) => TERMS[String(item)]?.[locale] ?? String(item))
      : value;
  const muscles = translateTerms(exercise.muscleGroups) as string[];
  const equipment = translateTerms(exercise.equipment) as string[];
  const guidance = localizedGuidance(exercise, name, locale, muscles ?? [], equipment ?? []);
  const alternatives = Array.isArray(exercise.alternatives)
    ? exercise.alternatives.map((alternative) => {
        if (alternative && typeof alternative === 'object') {
          const record = alternative as JsonObject;
          const alternativeName = String(record.name ?? '');
          return {
            ...record,
            name:
              EXERCISE_NAMES[alternativeName]?.[locale] ??
              ALTERNATIVE_NAMES[alternativeName.toLowerCase()]?.[locale] ??
              alternativeName,
          };
        }
        const alternativeName = String(alternative);
        return (
          EXERCISE_NAMES[alternativeName]?.[locale] ??
          ALTERNATIVE_NAMES[alternativeName.toLowerCase()]?.[locale] ??
          alternativeName
        );
      })
    : exercise.alternatives;

  return {
    ...exercise,
    name,
    muscleGroups: muscles,
    equipment,
    ...guidance,
    alternatives,
    targetRpe:
      locale === 'pt'
        ? guidance.targetRpe
        : String(exercise.difficulty) === 'advanced'
          ? locale === 'en'
            ? 'RPE 8–9, maintaining clean technique.'
            : 'RPE 8–9, manteniendo una técnica limpia.'
          : String(exercise.difficulty) === 'intermediate'
            ? locale === 'en'
              ? 'RPE 7–8, leaving 2–3 repetitions in reserve.'
              : 'RPE 7–8, dejando 2–3 repeticiones en reserva.'
            : locale === 'en'
              ? 'RPE 6–7, leaving 3–4 repetitions in reserve.'
              : 'RPE 6–7, dejando 3–4 repeticiones en reserva.',
  };
}

export function localizeWorkoutPlan<T>(plan: T, requestedLocale?: string): T {
  if (!plan || typeof plan !== 'object') return plan;
  const locale = localeOf(requestedLocale);
  const source = plan as JsonObject;
  if (!Array.isArray(source.days)) {
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== 'object') return value;
      const nested = value as JsonObject;
      if (Array.isArray(nested.days)) return localizeWorkoutPlan(nested, locale);
      return Object.fromEntries(Object.entries(nested).map(([key, item]) => [key, visit(item)]));
    };
    return visit(source) as T;
  }
  const days = Array.isArray(source.days)
    ? source.days.map((rawDay, index) => {
        const day = rawDay as JsonObject;
        const exercises = Array.isArray(day.exercises)
          ? day.exercises.map((exercise) => localizeExercise(exercise as JsonObject, locale))
          : [];
        const muscles = [
          ...new Set(
            exercises.flatMap((exercise) =>
              Array.isArray(exercise.muscleGroups)
                ? exercise.muscleGroups.map((muscle) => String(muscle))
                : [],
            ),
          ),
        ].slice(0, 3);
        return {
          ...day,
          name: translatePlanLabel(day.name ?? `Dia ${index + 1}`, locale),
          focusArea: translatePlanLabel(
            day.focusArea ??
              (muscles.join(', ') ||
                text('Treino completo', 'Full-body workout', 'Entrenamiento de cuerpo completo')[
                  locale
                ]),
            locale,
          ),
          exercises,
        };
      })
    : source.days;

  return {
    ...source,
    name: translatePlanLabel(source.name ?? 'Plano de treino personalizado', locale),
    days,
  } as T;
}

export const workoutCatalogLocalizationCoverage = {
  exerciseNames: new Set(Object.keys(EXERCISE_NAMES)),
  alternativeNames: new Set(Object.keys(ALTERNATIVE_NAMES)),
  planNames: new Set(Object.keys(PLAN_NAMES)),
};
