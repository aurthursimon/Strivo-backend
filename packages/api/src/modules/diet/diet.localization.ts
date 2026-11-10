import { normalizeAcceptLanguage } from '../../common/locale/accept-language';

export type DietLocale = 'en' | 'pt' | 'es';

type LocalizedText = Record<DietLocale, string>;
type Ingredient = { name: string; amount: string; substitutions?: Ingredient[] };

const text = (pt: string, en: string, es: string): LocalizedText => ({ pt, en, es });

export function resolveDietLocale(locale?: string): DietLocale {
  return normalizeAcceptLanguage(locale) ?? 'en';
}

const INGREDIENT_NAMES: Record<string, LocalizedText> = {
  Abacate: text('Abacate', 'Avocado', 'Aguacate'),
  Abacaxi: text('Abacaxi', 'Pineapple', 'Piña'),
  Abobrinha: text('Abobrinha', 'Zucchini', 'Calabacín'),
  Alho: text('Alho', 'Garlic', 'Ajo'),
  Amendoas: text('Amêndoas', 'Almonds', 'Almendras'),
  'Arroz integral': text('Arroz integral', 'Brown rice', 'Arroz integral'),
  Atum: text('Atum', 'Tuna', 'Atún'),
  'Aveia em flocos': text('Aveia em flocos', 'Rolled oats', 'Copos de avena'),
  'Azeite de oliva': text('Azeite de oliva', 'Olive oil', 'Aceite de oliva'),
  Banana: text('Banana', 'Banana', 'Banana'),
  'Batata-doce': text('Batata-doce', 'Sweet potato', 'Batata'),
  'Bebida de amendoas sem acucar': text(
    'Bebida de amêndoas sem açúcar',
    'Unsweetened almond drink',
    'Bebida de almendras sin azúcar',
  ),
  'Bebida de soja sem acucar': text(
    'Bebida de soja sem açúcar',
    'Unsweetened soy drink',
    'Bebida de soja sin azúcar',
  ),
  Berinjela: text('Berinjela', 'Eggplant', 'Berenjena'),
  Brocolis: text('Brócolis', 'Broccoli', 'Brócoli'),
  'Cacau em po': text('Cacau em pó', 'Cocoa powder', 'Cacao en polvo'),
  Camarao: text('Camarão', 'Shrimp', 'Camarones'),
  'Carne de panela magra': text(
    'Carne de panela magra',
    'Lean braised beef',
    'Carne magra guisada',
  ),
  Castanhas: text('Castanhas', 'Mixed nuts', 'Frutos secos'),
  Cenoura: text('Cenoura', 'Carrot', 'Zanahoria'),
  Chia: text('Chia', 'Chia seeds', 'Semillas de chía'),
  'Couve-flor': text('Couve-flor', 'Cauliflower', 'Coliflor'),
  Couve: text('Couve', 'Collard greens', 'Col rizada'),
  'Crackers integrais': text('Crackers integrais', 'Whole-grain crackers', 'Galletas integrales'),
  'Creme de castanha': text('Creme de castanha', 'Nut cream', 'Crema de frutos secos'),
  Crepioca: text('Crepioca', 'Crepioca', 'Crepioca'),
  'Cuscuz de milho': text('Cuscuz de milho', 'Corn couscous', 'Cuscús de maíz'),
  Edamame: text('Edamame', 'Edamame', 'Edamame'),
  Espinafre: text('Espinafre', 'Spinach', 'Espinaca'),
  'Ervas frescas': text('Ervas frescas', 'Fresh herbs', 'Hierbas frescas'),
  Ervilha: text('Ervilha', 'Peas', 'Guisantes'),
  Feijao: text('Feijão', 'Beans', 'Frijoles'),
  'Feijao branco': text('Feijão branco', 'White beans', 'Frijoles blancos'),
  'Folhas verdes': text('Folhas verdes', 'Leafy greens', 'Hojas verdes'),
  'Frango desfiado': text('Frango desfiado', 'Shredded chicken', 'Pollo desmenuzado'),
  'Frango moido': text('Frango moído', 'Ground chicken', 'Pollo molido'),
  Gengibre: text('Gengibre', 'Ginger', 'Jengibre'),
  Gergelim: text('Gergelim', 'Sesame seeds', 'Semillas de sésamo'),
  'Grao-de-bico': text('Grão-de-bico', 'Chickpeas', 'Garbanzos'),
  'Granola sem mel': text('Granola sem mel', 'Honey-free granola', 'Granola sin miel'),
  Granola: text('Granola', 'Granola', 'Granola'),
  Homus: text('Homus', 'Hummus', 'Hummus'),
  Inhame: text('Inhame', 'Yam', 'Ñame'),
  'Iogurte de coco sem acucar': text(
    'Iogurte de coco sem açúcar',
    'Unsweetened coconut yogurt',
    'Yogur de coco sin azúcar',
  ),
  'Iogurte de soja sem acucar': text(
    'Iogurte de soja sem açúcar',
    'Unsweetened soy yogurt',
    'Yogur de soja sin azúcar',
  ),
  'Iogurte grego natural': text(
    'Iogurte grego natural',
    'Plain Greek yogurt',
    'Yogur griego natural',
  ),
  'Iogurte natural': text('Iogurte natural', 'Plain yogurt', 'Yogur natural'),
  'Kefir natural': text('Kefir natural', 'Plain kefir', 'Kéfir natural'),
  'Leite de coco light': text('Leite de coco light', 'Light coconut milk', 'Leche de coco ligera'),
  'Leite de coco': text('Leite de coco', 'Coconut milk', 'Leche de coco'),
  Lentilha: text('Lentilha', 'Lentils', 'Lentejas'),
  Limao: text('Limão', 'Lemon', 'Limón'),
  Linguado: text('Linguado', 'Sole', 'Lenguado'),
  Linhaca: text('Linhaça', 'Flaxseed', 'Linaza'),
  'Lombo suino magro': text('Lombo suíno magro', 'Lean pork loin', 'Lomo de cerdo magro'),
  Maca: text('Maçã', 'Apple', 'Manzana'),
  'Macarrao integral': text('Macarrão integral', 'Whole-wheat pasta', 'Pasta integral'),
  Mamao: text('Mamão', 'Papaya', 'Papaya'),
  Mandioca: text('Mandioca', 'Cassava', 'Yuca'),
  Manga: text('Manga', 'Mango', 'Mango'),
  Maracuja: text('Maracujá', 'Passion fruit', 'Maracuyá'),
  Morango: text('Morango', 'Strawberries', 'Fresas'),
  'Mostarda sem acucar': text('Mostarda sem açúcar', 'Sugar-free mustard', 'Mostaza sin azúcar'),
  Nozes: text('Nozes', 'Walnuts', 'Nueces'),
  Ovos: text('Ovos', 'Eggs', 'Huevos'),
  Palmito: text('Palmito', 'Hearts of palm', 'Palmito'),
  'Pao integral': text('Pão integral', 'Whole-grain bread', 'Pan integral'),
  'Pao sirio integral': text('Pão sírio integral', 'Whole-wheat pita', 'Pan de pita integral'),
  Paprica: text('Páprica', 'Paprika', 'Pimentón'),
  'Pasta de amendoim': text('Pasta de amendoim', 'Peanut butter', 'Crema de cacahuate'),
  'Patinho em bife': text('Patinho em bife', 'Lean beef steak', 'Bistec de carne magra'),
  Patinho: text('Patinho', 'Lean beef', 'Carne magra'),
  'Patinho moido': text('Patinho moído', 'Lean ground beef', 'Carne molida magra'),
  'Peito de frango': text('Peito de frango', 'Chicken breast', 'Pechuga de pollo'),
  'Peito de peru': text('Peito de peru', 'Turkey breast', 'Pechuga de pavo'),
  Pepino: text('Pepino', 'Cucumber', 'Pepino'),
  Pera: text('Pera', 'Pear', 'Pera'),
  'Pescada branca': text('Pescada branca', 'Hake', 'Merluza'),
  Pimentao: text('Pimentão', 'Bell pepper', 'Pimiento'),
  'Proteina de soja texturizada': text(
    'Proteína de soja texturizada',
    'Textured soy protein',
    'Proteína de soja texturizada',
  ),
  'Proteina vegetal': text('Proteína vegetal', 'Plant protein', 'Proteína vegetal'),
  'Queijo cottage': text('Queijo cottage', 'Cottage cheese', 'Queso cottage'),
  'Queijo minas': text('Queijo minas', 'Minas cheese', 'Queso Minas'),
  'Queijo branco': text('Queijo branco', 'White cheese', 'Queso blanco'),
  'Queijo feta': text('Queijo feta', 'Feta cheese', 'Queso feta'),
  'Queijo parmesao': text('Queijo parmesão', 'Parmesan cheese', 'Queso parmesano'),
  'Queijo prato': text('Queijo prato', 'Prato cheese', 'Queso prato'),
  Quinoa: text('Quinoa', 'Quinoa', 'Quinoa'),
  Repolho: text('Repolho', 'Cabbage', 'Repollo'),
  Ricota: text('Ricota', 'Ricotta', 'Ricota'),
  Salmao: text('Salmão', 'Salmon', 'Salmón'),
  'Salmao defumado': text('Salmão defumado', 'Smoked salmon', 'Salmón ahumado'),
  Sardinha: text('Sardinha', 'Sardines', 'Sardinas'),
  Seitan: text('Seitan', 'Seitan', 'Seitán'),
  'Semente de abobora': text('Semente de abóbora', 'Pumpkin seeds', 'Semillas de calabaza'),
  'Semente de girassol': text('Semente de girassol', 'Sunflower seeds', 'Semillas de girasol'),
  'Semente de hemp': text('Semente de cânhamo', 'Hemp seeds', 'Semillas de cáñamo'),
  'Soja cozida': text('Soja cozida', 'Cooked soybeans', 'Soja cocida'),
  Tahine: text('Tahine', 'Tahini', 'Tahini'),
  Tapioca: text('Tapioca', 'Tapioca', 'Tapioca'),
  Tempeh: text('Tempeh', 'Tempeh', 'Tempeh'),
  Tilapia: text('Tilápia', 'Tilapia', 'Tilapia'),
  'Tofu cremoso': text('Tofu cremoso', 'Silken tofu', 'Tofu cremoso'),
  'Tofu firme': text('Tofu firme', 'Firm tofu', 'Tofu firme'),
  Tomate: text('Tomate', 'Tomato', 'Tomate'),
  'Tomate-cereja': text('Tomate-cereja', 'Cherry tomatoes', 'Tomates cherry'),
  Vagem: text('Vagem', 'Green beans', 'Judías verdes'),
  Vinagre: text('Vinagre', 'Vinegar', 'Vinagre'),
  'Whey protein': text('Whey protein', 'Whey protein', 'Proteína de suero'),
  'Wrap integral': text('Wrap integral', 'Whole-wheat wrap', 'Wrap integral'),
  Abobora: text('Abóbora', 'Pumpkin', 'Calabaza'),
  Acai: text('Açaí', 'Açaí', 'Açaí'),
  'Acai sem xarope': text('Açaí sem xarope', 'Açaí without syrup', 'Açaí sin jarabe'),
  Aspargos: text('Aspargos', 'Asparagus', 'Espárragos'),
  'Banana-da-terra': text('Banana-da-terra', 'Plantain', 'Plátano macho'),
  'Bebida de coco sem acucar': text(
    'Bebida de coco sem açúcar',
    'Unsweetened coconut drink',
    'Bebida de coco sin azúcar',
  ),
  Cogumelos: text('Cogumelos', 'Mushrooms', 'Champiñones'),
  'Farinha de amendoas': text('Farinha de amêndoas', 'Almond flour', 'Harina de almendras'),
  'Gelatina sem acucar': text('Gelatina sem açúcar', 'Sugar-free gelatin', 'Gelatina sin azúcar'),
  Laranja: text('Laranja', 'Orange', 'Naranja'),
  'Molho de tomate': text('Molho de tomate', 'Tomato sauce', 'Salsa de tomate'),
  'Mucarela de bufala': text('Muçarela de búfala', 'Buffalo mozzarella', 'Mozzarella de búfala'),
  Mortadela: text('Mortadela', 'Mortadella', 'Mortadela'),
  'Feijao preto': text('Feijão preto', 'Black beans', 'Frijoles negros'),
  'Batata inglesa': text('Batata inglesa', 'Potato', 'Papa'),
  Bacalhau: text('Bacalhau', 'Salt cod', 'Bacalao'),
  'Pao de queijo': text('Pão de queijo', 'Brazilian cheese bread', 'Pan de queso brasileño'),
  'Farinha de mandioca': text('Farinha de mandioca', 'Cassava flour', 'Harina de yuca'),
  Canjiquinha: text('Canjiquinha', 'Cracked corn', 'Maíz partido'),
  'Goiabada sem acucar': text(
    'Goiabada sem açúcar',
    'Sugar-free guava paste',
    'Dulce de guayaba sin azúcar',
  ),
  'Fuba de milho': text('Fubá de milho', 'Cornmeal', 'Harina de maíz'),
  'Queijo canastra': text('Queijo canastra', 'Canastra cheese', 'Queso Canastra'),
  Quiabo: text('Quiabo', 'Okra', 'Quimbombó'),
  'Charque magro': text('Charque magro', 'Lean dried beef', 'Carne seca magra'),
  'Polenta cozida': text('Polenta cozida', 'Cooked polenta', 'Polenta cocida'),
  Uva: text('Uva', 'Grapes', 'Uvas'),
  Tainha: text('Tainha', 'Mullet', 'Lisa'),
  Marreco: text('Marreco', 'Duck', 'Pato'),
  'Repolho roxo': text('Repolho roxo', 'Red cabbage', 'Repollo morado'),
  Berbigao: text('Berbigão', 'Cockles', 'Berberechos'),
  Ostras: text('Ostras', 'Oysters', 'Ostras'),
  'Agnolini integral': text('Agnolini integral', 'Whole-wheat agnolini', 'Agnolini integral'),
};

const BRAZILIAN_RECIPE_NAMES: Record<string, LocalizedText> = {
  'Pao na chapa integral com queijo minas': text(
    'Pão na chapa integral com queijo minas',
    'Toasted whole-grain bread with Minas cheese',
    'Pan integral a la plancha con queso Minas',
  ),
  'Tapioca de frango com tomate': text(
    'Tapioca de frango com tomate',
    'Chicken and tomato tapioca',
    'Tapioca con pollo y tomate',
  ),
  'Cuscuz paulista de ovos e legumes': text(
    'Cuscuz paulista de ovos e legumes',
    'São Paulo corn couscous with eggs and vegetables',
    'Cuscús paulista de maíz con huevos y verduras',
  ),
  'Vitamina de mamao com aveia e chia': text(
    'Vitamina de mamão com aveia e chia',
    'Papaya smoothie with oats and chia',
    'Batido de papaya con avena y chía',
  ),
  'Crepioca de ricota e espinafre': text(
    'Crepioca de ricota e espinafre',
    'Ricotta and spinach crepioca',
    'Crepioca de ricota y espinaca',
  ),
  'Sanduiche paulistano de peru queijo e tomate': text(
    'Sanduíche paulistano de peru, queijo e tomate',
    'São Paulo-style turkey, cheese, and tomato sandwich',
    'Sándwich paulista de pavo, queso y tomate',
  ),
  'Acai com banana aveia e chia': text(
    'Açaí com banana, aveia e chia',
    'Açaí bowl with banana, oats, and chia',
    'Açaí con banana, avena y chía',
  ),
  'Omelete de forno com couve e queijo minas': text(
    'Omelete de forno com couve e queijo minas',
    'Baked omelet with collard greens and Minas cheese',
    'Omelet al horno con col rizada y queso Minas',
  ),
  'Sardinha com cuscuz e tomate': text(
    'Sardinha com cuscuz e tomate',
    'Sardines with corn couscous and tomato',
    'Sardinas con cuscús de maíz y tomate',
  ),
  'Churrasco matinal de patinho com ovos': text(
    'Churrasco matinal de patinho com ovos',
    'Morning grilled lean beef with eggs',
    'Carne magra a la parrilla con huevos para el desayuno',
  ),
  'Bolo assado de banana aveia e ovos': text(
    'Bolo assado de banana, aveia e ovos',
    'Baked banana, oat, and egg cake',
    'Pastel horneado de banana, avena y huevos',
  ),
  'Cuscuz de lanche com queijo minas': text(
    'Cuscuz de lanche com queijo minas',
    'Corn couscous snack with Minas cheese',
    'Cuscús de maíz con queso Minas',
  ),
  'Iogurte natural com mamao e chia': text(
    'Iogurte natural com mamão e chia',
    'Plain yogurt with papaya and chia',
    'Yogur natural con papaya y chía',
  ),
  'Tapioca pequena de ricota e tomate': text(
    'Tapioca pequena de ricota e tomate',
    'Small ricotta and tomato tapioca',
    'Tapioca pequeña de ricota y tomate',
  ),
  'Banana assada com cacau e castanhas': text(
    'Banana assada com cacau e castanhas',
    'Baked banana with cocoa and mixed nuts',
    'Banana asada con cacao y frutos secos',
  ),
  'Mini bauru integral de peru queijo e tomate': text(
    'Mini bauru integral de peru, queijo e tomate',
    'Mini whole-grain bauru with turkey, cheese, and tomato',
    'Mini bauru integral de pavo, queso y tomate',
  ),
  'Creme de acai com morango e chia': text(
    'Creme de açaí com morango e chia',
    'Açaí cream with strawberries and chia',
    'Crema de açaí con fresas y chía',
  ),
  'Homus com tapioca crocante e tomate': text(
    'Homus com tapioca crocante e tomate',
    'Hummus with crispy tapioca and tomato',
    'Hummus con tapioca crujiente y tomate',
  ),
  'Atum com mandioca e limao': text(
    'Atum com mandioca e limão',
    'Tuna with cassava and lemon',
    'Atún con yuca y limón',
  ),
  'Rolinhos de frango com queijo minas': text(
    'Rolinhos de frango com queijo minas',
    'Chicken rolls with Minas cheese',
    'Rollitos de pollo con queso Minas',
  ),
  'Virado a paulista leve com lombo ovos e couve': text(
    'Virado à paulista leve com lombo, ovos e couve',
    'Light São Paulo-style virado with pork loin, eggs, and collard greens',
    'Virado paulista ligero con lomo de cerdo, huevos y col rizada',
  ),
  'Picadinho paulistano com arroz feijao e couve': text(
    'Picadinho paulistano com arroz, feijão e couve',
    'São Paulo-style minced beef with rice, beans, and collard greens',
    'Picadillo paulista con arroz, frijoles y col rizada',
  ),
  'Prato feito de frango arroz feijao e brocolis': text(
    'Prato feito de frango, arroz, feijão e brócolis',
    'Brazilian chicken plate with rice, beans, and broccoli',
    'Plato brasileño de pollo con arroz, frijoles y brócoli',
  ),
  'Escondidinho leve de patinho e mandioca': text(
    'Escondidinho leve de patinho e mandioca',
    'Light cassava bake with lean beef',
    'Pastel ligero de yuca con carne magra',
  ),
  'Abobrinha recheada a paulista com frango e queijo': text(
    'Abobrinha recheada à paulista com frango e queijo',
    'São Paulo-style zucchini stuffed with chicken and cheese',
    'Calabacín relleno al estilo paulista con pollo y queso',
  ),
  'Feijao tropeiro vegetariano com ovos e couve': text(
    'Feijão tropeiro vegetariano com ovos e couve',
    'Vegetarian tropeiro beans with eggs and collard greens',
    'Frijoles tropeiros vegetarianos con huevos y col rizada',
  ),
  'Moqueca vegana de palmito banana-da-terra e tofu': text(
    'Moqueca vegana de palmito, banana-da-terra e tofu',
    'Vegan hearts of palm, plantain, and tofu moqueca',
    'Moqueca vegana de palmito, plátano macho y tofu',
  ),
  'Arroz feijao lentilha e couve a brasileira': text(
    'Arroz, feijão, lentilha e couve à brasileira',
    'Brazilian-style rice, beans, lentils, and collard greens',
    'Arroz, frijoles, lentejas y col rizada al estilo brasileño',
  ),
  'Pescada com arroz feijao e vinagrete': text(
    'Pescada com arroz, feijão e vinagrete',
    'Hake with rice, beans, and vinaigrette',
    'Merluza con arroz, frijoles y vinagreta',
  ),
  'Churrasco de patinho com lombo e ovos': text(
    'Churrasco de patinho com lombo e ovos',
    'Grilled lean beef with pork loin and eggs',
    'Carne magra a la parrilla con lomo de cerdo y huevos',
  ),
  'Bauru integral de peru queijo e tomate': text(
    'Bauru integral de peru, queijo e tomate',
    'Whole-grain bauru with turkey, cheese, and tomato',
    'Bauru integral de pavo, queso y tomate',
  ),
  'Pao integral com ricota temperada e tomate': text(
    'Pão integral com ricota temperada e tomate',
    'Whole-grain bread with seasoned ricotta and tomato',
    'Pan integral con ricota condimentada y tomate',
  ),
  'Tapioca paulistana de banana e pasta de amendoim': text(
    'Tapioca paulistana de banana e pasta de amendoim',
    'São Paulo-style banana and peanut butter tapioca',
    'Tapioca paulista de banana y crema de cacahuate',
  ),
  'Cuscuz com queijo minas e tomate': text(
    'Cuscuz com queijo minas e tomate',
    'Corn couscous with Minas cheese and tomato',
    'Cuscús de maíz con queso Minas y tomate',
  ),
  'Cottage com abacate e tomate': text(
    'Cottage com abacate e tomate',
    'Cottage cheese with avocado and tomato',
    'Queso cottage con aguacate y tomate',
  ),
  'Bolinho assado de arroz queijo e ovos': text(
    'Bolinho assado de arroz, queijo e ovos',
    'Baked rice, cheese, and egg fritters',
    'Buñuelos horneados de arroz, queso y huevos',
  ),
  'Sanduiche de homus com cenoura e couve': text(
    'Sanduíche de homus com cenoura e couve',
    'Hummus sandwich with carrot and collard greens',
    'Sándwich de hummus con zanahoria y col rizada',
  ),
  'Creme de manga com iogurte de soja e chia': text(
    'Creme de manga com iogurte de soja e chia',
    'Mango cream with soy yogurt and chia',
    'Crema de mango con yogur de soja y chía',
  ),
  'Sardinha com mandioca assada e limao': text(
    'Sardinha com mandioca assada e limão',
    'Sardines with roasted cassava and lemon',
    'Sardinas con yuca asada y limón',
  ),
  'Espetinho frio de frango e queijo minas': text(
    'Espetinho frio de frango e queijo minas',
    'Cold chicken and Minas cheese skewers',
    'Brochetas frías de pollo y queso Minas',
  ),
  'Macarrao integral a bolonhesa de patinho': text(
    'Macarrão integral à bolonhesa de patinho',
    'Whole-wheat pasta with lean beef bolognese',
    'Pasta integral a la boloñesa con carne magra',
  ),
  'Arroz de forno com frango e legumes': text(
    'Arroz de forno com frango e legumes',
    'Baked rice with chicken and vegetables',
    'Arroz al horno con pollo y verduras',
  ),
  'Sopa de feijao com couve e frango': text(
    'Sopa de feijão com couve e frango',
    'Bean soup with collard greens and chicken',
    'Sopa de frijoles con col rizada y pollo',
  ),
  'Caldo de mandioca com carne e couve': text(
    'Caldo de mandioca com carne e couve',
    'Cassava soup with beef and collard greens',
    'Caldo de yuca con carne y col rizada',
  ),
  'Yakisoba paulistano leve de frango e legumes': text(
    'Yakisoba paulistano leve de frango e legumes',
    'Light São Paulo-style chicken and vegetable yakisoba',
    'Yakisoba paulista ligero de pollo y verduras',
  ),
  'Omelete a paulista com tomate queijo e couve': text(
    'Omelete à paulista com tomate, queijo e couve',
    'São Paulo-style omelet with tomato, cheese, and collard greens',
    'Omelet paulista con tomate, queso y col rizada',
  ),
  'Moqueca de banana-da-terra palmito e grao-de-bico': text(
    'Moqueca de banana-da-terra, palmito e grão-de-bico',
    'Plantain, hearts of palm, and chickpea moqueca',
    'Moqueca de plátano macho, palmito y garbanzos',
  ),
  'Escondidinho vegano de mandioca e lentilha': text(
    'Escondidinho vegano de mandioca e lentilha',
    'Vegan cassava and lentil bake',
    'Pastel vegano de yuca y lentejas',
  ),
  'Tilapia a paulista com arroz e legumes': text(
    'Tilápia à paulista com arroz e legumes',
    'São Paulo-style tilapia with rice and vegetables',
    'Tilapia a la paulista con arroz y verduras',
  ),
  'Bife grelhado com lombo suino': text(
    'Bife grelhado com lombo suíno',
    'Grilled beef steak with pork loin',
    'Bistec a la parrilla con lomo de cerdo',
  ),
  'Creme de abobora com frango e couve': text(
    'Creme de abóbora com frango e couve',
    'Pumpkin cream soup with chicken and collard greens',
    'Crema de calabaza con pollo y col rizada',
  ),
  'Caldo de feijao com couve': text(
    'Caldo de feijão com couve',
    'Bean soup with collard greens',
    'Caldo de frijoles con col rizada',
  ),
  'Mingau de aveia com mamao e chia': text(
    'Mingau de aveia com mamão e chia',
    'Oatmeal with papaya and chia',
    'Avena cocida con papaya y chía',
  ),
  'Vitamina de abacate com bebida de soja': text(
    'Vitamina de abacate com bebida de soja',
    'Avocado smoothie with soy drink',
    'Batido de aguacate con bebida de soja',
  ),
  'Queijo minas com mamao e castanhas': text(
    'Queijo minas com mamão e castanhas',
    'Minas cheese with papaya and mixed nuts',
    'Queso Minas con papaya y frutos secos',
  ),
  'Sopa leve de legumes com tofu': text(
    'Sopa leve de legumes com tofu',
    'Light vegetable soup with tofu',
    'Sopa ligera de verduras con tofu',
  ),
  'Cuscuz pequeno com ovos e queijo': text(
    'Cuscuz pequeno com ovos e queijo',
    'Small corn couscous with eggs and cheese',
    'Cuscús pequeño de maíz con huevos y queso',
  ),
  'Omelete leve de couve e ricota': text(
    'Omelete leve de couve e ricota',
    'Light collard green and ricotta omelet',
    'Omelet ligero de col rizada y ricota',
  ),
  'Caldo leve de peixe com mandioca e couve': text(
    'Caldo leve de peixe com mandioca e couve',
    'Light fish soup with cassava and collard greens',
    'Caldo ligero de pescado con yuca y col rizada',
  ),
  'Ovos mexidos com frango e queijo': text(
    'Ovos mexidos com frango e queijo',
    'Scrambled eggs with chicken and cheese',
    'Huevos revueltos con pollo y queso',
  ),
};

const REGIONAL_RECIPE_NAMES: Record<string, LocalizedText> = {
  'Frango a parmegiana assado com arroz e brocolis': text(
    'Frango à parmegiana assado com arroz e brócolis',
    'Baked chicken parmigiana with rice and broccoli',
    'Pollo a la parmesana al horno con arroz y brócoli',
  ),
  'Galinhada paulista integral com cenoura e couve': text(
    'Galinhada paulista integral com cenoura e couve',
    'São Paulo-style whole-grain chicken and rice with carrot and collard greens',
    'Arroz integral paulista con pollo, zanahoria y col rizada',
  ),
  'Lanche de pernil magro com tomate': text(
    'Lanche de pernil magro com tomate',
    'Lean pork sandwich with tomato',
    'Sándwich de cerdo magro con tomate',
  ),
  'Sanduiche paulistano de mortadela queijo e tomate': text(
    'Sanduíche paulistano de mortadela, queijo e tomate',
    'São Paulo-style mortadella, cheese, and tomato sandwich',
    'Sándwich paulista de mortadela, queso y tomate',
  ),
  'Coxinha assada de frango e mandioca': text(
    'Coxinha assada de frango e mandioca',
    'Baked chicken and cassava coxinha',
    'Coxinha horneada de pollo y yuca',
  ),
  'Beirute integral de patinho e tomate': text(
    'Beirute integral de patinho e tomate',
    'Whole-wheat lean beef and tomato beirute',
    'Beirute integral de carne magra y tomate',
  ),
  'Vaca atolada paulista leve': text(
    'Vaca atolada paulista leve',
    'Light São Paulo-style beef and cassava stew',
    'Estofado paulista ligero de carne y yuca',
  ),
  'Camarao na moranga paulista': text(
    'Camarão na moranga paulista',
    'São Paulo-style shrimp in pumpkin',
    'Camarones en calabaza al estilo paulista',
  ),
  'Feijoada carioca leve com couve e arroz': text(
    'Feijoada carioca leve com couve e arroz',
    'Light Rio-style feijoada with collard greens and rice',
    'Feijoada carioca ligera con col rizada y arroz',
  ),
  'File a Oswaldo Aranha leve': text(
    'Filé à Oswaldo Aranha leve',
    'Light Oswaldo Aranha-style steak',
    'Filete ligero al estilo Oswaldo Aranha',
  ),
  'Picadinho carioca com arroz e feijao preto': text(
    'Picadinho carioca com arroz e feijão preto',
    'Rio-style minced beef with rice and black beans',
    'Picadillo carioca con arroz y frijoles negros',
  ),
  'Peixada a brasileira com mandioca': text(
    'Peixada à brasileira com mandioca',
    'Brazilian fish stew with cassava',
    'Guiso brasileño de pescado con yuca',
  ),
  'Sopa a Leao Veloso leve': text(
    'Sopa à Leão Veloso leve',
    'Light Leão Veloso-style seafood soup',
    'Sopa ligera al estilo Leão Veloso',
  ),
  'Caldinho carioca de feijao preto': text(
    'Caldinho carioca de feijão preto',
    'Rio-style black bean soup',
    'Caldo carioca de frijoles negros',
  ),
  'Bolinho assado de bacalhau e batata': text(
    'Bolinho assado de bacalhau e batata',
    'Baked salt cod and potato fritters',
    'Buñuelos horneados de bacalao y papa',
  ),
  'Peixe ensopado da Costa Verde com banana-da-terra': text(
    'Peixe ensopado da Costa Verde com banana-da-terra',
    'Costa Verde fish stew with plantain',
    'Guiso de pescado de Costa Verde con plátano macho',
  ),
  'Pao de queijo mineiro com cottage': text(
    'Pão de queijo mineiro com cottage',
    'Minas cheese bread with cottage cheese',
    'Pan de queso mineiro con queso cottage',
  ),
  'Frango com quiabo e arroz integral': text(
    'Frango com quiabo e arroz integral',
    'Chicken with okra and brown rice',
    'Pollo con quimbombó y arroz integral',
  ),
  'Tutu de feijao mineiro com lombo e couve': text(
    'Tutu de feijão mineiro com lombo e couve',
    'Minas-style bean tutu with pork loin and collard greens',
    'Tutu mineiro de frijoles con lomo de cerdo y col rizada',
  ),
  'Vaca atolada mineira leve': text(
    'Vaca atolada mineira leve',
    'Light Minas-style beef and cassava stew',
    'Estofado mineiro ligero de carne y yuca',
  ),
  'Canjiquinha mineira com frango e couve': text(
    'Canjiquinha mineira com frango e couve',
    'Minas-style cracked corn with chicken and collard greens',
    'Maíz partido mineiro con pollo y col rizada',
  ),
  'Romeu e Julieta leve': text(
    'Romeu e Julieta leve',
    'Light Minas cheese with guava paste',
    'Queso Minas ligero con dulce de guayaba',
  ),
  'Angu mineiro com patinho e couve': text(
    'Angu mineiro com patinho e couve',
    'Minas-style cornmeal porridge with lean beef and collard greens',
    'Angu mineiro con carne magra y col rizada',
  ),
  'Broa mineira de milho com queijo canastra': text(
    'Broa mineira de milho com queijo canastra',
    'Minas corn bread with Canastra cheese',
    'Pan de maíz mineiro con queso Canastra',
  ),
  'Arroz carreteiro gaucho leve': text(
    'Arroz carreteiro gaúcho leve',
    'Light gaucho carreteiro rice',
    'Arroz carreteiro gaúcho ligero',
  ),
  'Galeto gaucho assado com polenta': text(
    'Galeto gaúcho assado com polenta',
    'Roasted gaucho chicken with polenta',
    'Pollo gaúcho asado con polenta',
  ),
  'Charque gaucho com abobora e couve': text(
    'Charque gaúcho com abóbora e couve',
    'Gaucho dried beef with pumpkin and collard greens',
    'Carne seca gaúcha con calabaza y col rizada',
  ),
  'Polenta com patinho ao molho': text(
    'Polenta com patinho ao molho',
    'Polenta with lean beef sauce',
    'Polenta con salsa de carne magra',
  ),
  'Cuca gaucha de banana e aveia': text(
    'Cuca gaúcha de banana e aveia',
    'Gaucho banana and oat crumb cake',
    'Cuca gaúcha de banana y avena',
  ),
  'Sagu gaucho de chia e uva': text(
    'Sagu gaúcho de chia e uva',
    'Gaucho-style chia and grape pudding',
    'Sagu gaúcho de chía y uva',
  ),
  'Xixo gaucho de carne frango e legumes': text(
    'Xixo gaúcho de carne, frango e legumes',
    'Gaucho beef, chicken, and vegetable skewers',
    'Xixo gaúcho de carne, pollo y verduras',
  ),
  'Tortei gaucho de abobora e ricota': text(
    'Tortéi gaúcho de abóbora e ricota',
    'Gaucho pumpkin and ricotta tortelli',
    'Tortéi gaúcho de calabaza y ricota',
  ),
  'Tainha catarinense assada com pirao e couve': text(
    'Tainha catarinense assada com pirão e couve',
    'Santa Catarina roasted mullet with cassava gravy and collard greens',
    'Lisa catarinense asada con pirão y col rizada',
  ),
  'Peixada catarinense com mandioca e tomate': text(
    'Peixada catarinense com mandioca e tomate',
    'Santa Catarina fish stew with cassava and tomato',
    'Guiso catarinense de pescado con yuca y tomate',
  ),
  'Marreco catarinense com repolho roxo': text(
    'Marreco catarinense com repolho roxo',
    'Santa Catarina duck with red cabbage',
    'Pato catarinense con repollo morado',
  ),
  'Pirao catarinense de peixe com arroz': text(
    'Pirão catarinense de peixe com arroz',
    'Santa Catarina fish cassava gravy with rice',
    'Pirão catarinense de pescado con arroz',
  ),
  'Arroz de berbigao com tomate e couve': text(
    'Arroz de berbigão com tomate e couve',
    'Cockle rice with tomato and collard greens',
    'Arroz de berberechos con tomate y col rizada',
  ),
  'Ostras catarinenses assadas com legumes': text(
    'Ostras catarinenses assadas com legumes',
    'Baked Santa Catarina oysters with vegetables',
    'Ostras catarinenses al horno con verduras',
  ),
  'Sopa agnolini catarinense de frango e legumes': text(
    'Sopa agnolini catarinense de frango e legumes',
    'Santa Catarina chicken and vegetable agnolini soup',
    'Sopa catarinense de agnolini con pollo y verduras',
  ),
  'Entrevero catarinense leve de carnes e legumes': text(
    'Entrevero catarinense leve de carnes e legumes',
    'Light Santa Catarina mixed meat and vegetable skillet',
    'Entrevero catarinense ligero de carnes y verduras',
  ),
  'Tapa filipino de patinho com arroz integral e ovo': text(
    'Tapa filipino de patinho com arroz integral e ovo',
    'Filipino-style beef tapa with brown rice and egg',
    'Tapa filipino de carne magra con arroz integral y huevo',
  ),
  'Tinola filipino de frango com abobrinha e espinafre': text(
    'Tinola filipino de frango com abobrinha e espinafre',
    'Filipino chicken tinola with zucchini and spinach',
    'Tinola filipino de pollo con calabacín y espinaca',
  ),
  'Adobo filipino de frango leve com arroz integral': text(
    'Adobo filipino de frango leve com arroz integral',
    'Light Filipino chicken adobo with brown rice',
    'Adobo filipino ligero de pollo con arroz integral',
  ),
  'Sinigang filipino de peixe com berinjela e tomate': text(
    'Sinigang filipino de peixe com berinjela e tomate',
    'Filipino fish sinigang with eggplant and tomato',
    'Sinigang filipino de pescado con berenjena y tomate',
  ),
  'Pinakbet filipino de camarao com abobrinha e pimentao': text(
    'Pinakbet filipino de camarão com abobrinha e pimentão',
    'Filipino shrimp pinakbet with zucchini and bell pepper',
    'Pinakbet filipino de camarones con calabacín y pimiento',
  ),
  'Ginisang filipino de lentilha com couve': text(
    'Ginisang filipino de lentilha com couve',
    'Filipino-style sautéed lentils with collard greens',
    'Ginisang filipino de lentejas con col rizada',
  ),
  'Lanche filipino de banana com aveia e castanhas': text(
    'Lanche filipino de banana com aveia e castanhas',
    'Filipino-style banana snack with oats and mixed nuts',
    'Merienda filipina de banana con avena y frutos secos',
  ),
  'Caldo filipino de peixe com arroz integral e gengibre': text(
    'Caldo filipino de peixe com arroz integral e gengibre',
    'Filipino fish and ginger rice soup',
    'Caldo filipino de pescado con arroz integral y jengibre',
  ),
};

const RECIPE_NAMES: Record<string, LocalizedText> = {
  ...BRAZILIAN_RECIPE_NAMES,
  ...REGIONAL_RECIPE_NAMES,
  'Mingau de aveia com banana e chia': text(
    'Mingau de aveia com banana e chia',
    'Oatmeal with banana and chia',
    'Avena cocida con banana y chía',
  ),
  'Tofu mexido com batata-doce': text(
    'Tofu mexido com batata-doce',
    'Scrambled tofu with sweet potato',
    'Tofu revuelto con batata',
  ),
  'Smoothie verde com proteina vegetal': text(
    'Smoothie verde com proteína vegetal',
    'Green smoothie with plant protein',
    'Batido verde con proteína vegetal',
  ),
  'Tapioca de homus com tomate': text(
    'Tapioca de homus com tomate',
    'Tapioca with hummus and tomato',
    'Tapioca con hummus y tomate',
  ),
  'Iogurte de coco com granola e morango': text(
    'Iogurte de coco com granola e morango',
    'Coconut yogurt with granola and strawberries',
    'Yogur de coco con granola y fresas',
  ),
  'Omelete keto de espinafre e abacate': text(
    'Omelete keto de espinafre e abacate',
    'Keto spinach and avocado omelet',
    'Omelet keto de espinaca y aguacate',
  ),
  'Ovos com cogumelos e queijo': text(
    'Ovos com cogumelos e queijo',
    'Eggs with mushrooms and cheese',
    'Huevos con champiñones y queso',
  ),
  'Panqueca keto de amendoas': text(
    'Panqueca keto de amêndoas',
    'Keto almond pancake',
    'Panqueque keto de almendras',
  ),
  'Iogurte grego low carb com chia': text(
    'Iogurte grego low carb com chia',
    'Low-carb Greek yogurt with chia',
    'Yogur griego bajo en carbohidratos con chía',
  ),
  'Salmao defumado com ovos e folhas': text(
    'Salmão defumado com ovos e folhas',
    'Smoked salmon with eggs and leafy greens',
    'Salmón ahumado con huevos y hojas verdes',
  ),
  'Sanduiche integral de peru e cottage': text(
    'Sanduíche integral de peru e cottage',
    'Whole-grain turkey and cottage cheese sandwich',
    'Sándwich integral de pavo y queso cottage',
  ),
  'Cuscuz com ovos e queijo branco': text(
    'Cuscuz com ovos e queijo branco',
    'Corn couscous with eggs and white cheese',
    'Cuscús con huevos y queso blanco',
  ),
  'Mix de castanhas com maca': text(
    'Mix de castanhas com maçã',
    'Mixed nuts with apple',
    'Frutos secos con manzana',
  ),
  'Edamame com lima e tomate': text(
    'Edamame com lima e tomate',
    'Edamame with lime and tomato',
    'Edamame con lima y tomate',
  ),
  'Shake vegetal de cacau': text(
    'Shake vegetal de cacau',
    'Plant-based cocoa shake',
    'Batido vegetal de cacao',
  ),
  'Homus com cenoura e pepino': text(
    'Homus com cenoura e pepino',
    'Hummus with carrot and cucumber',
    'Hummus con zanahoria y pepino',
  ),
  'Queijo minas com castanhas': text(
    'Queijo minas com castanhas',
    'Minas cheese with mixed nuts',
    'Queso Minas con frutos secos',
  ),
  'Ovo cozido com guacamole': text(
    'Ovo cozido com guacamole',
    'Hard-boiled egg with guacamole',
    'Huevo cocido con guacamole',
  ),
  'Iogurte grego com canela e nozes': text(
    'Iogurte grego com canela e nozes',
    'Greek yogurt with cinnamon and walnuts',
    'Yogur griego con canela y nueces',
  ),
  'Rolinhos de peru com queijo': text(
    'Rolinhos de peru com queijo',
    'Turkey and cheese rolls',
    'Rollitos de pavo con queso',
  ),
  'Fruta com iogurte e granola': text(
    'Fruta com iogurte e granola',
    'Fruit with yogurt and granola',
    'Fruta con yogur y granola',
  ),
  'Atum com crackers integrais': text(
    'Atum com crackers integrais',
    'Tuna with whole-grain crackers',
    'Atún con galletas integrales',
  ),
  'Bowl de grao-de-bico com quinoa': text(
    'Bowl de grão-de-bico com quinoa',
    'Chickpea and quinoa bowl',
    'Bowl de garbanzos con quinoa',
  ),
  'Feijoada leve de lentilha': text(
    'Feijoada leve de lentilha',
    'Light lentil feijoada',
    'Feijoada ligera de lentejas',
  ),
  'Tofu xadrez com arroz integral': text(
    'Tofu xadrez com arroz integral',
    'Kung pao tofu with brown rice',
    'Tofu kung pao con arroz integral',
  ),
  'Moqueca de banana-da-terra e tofu': text(
    'Moqueca de banana-da-terra e tofu',
    'Plantain and tofu moqueca',
    'Moqueca de plátano macho y tofu',
  ),
  'Chili vegano de feijao': text(
    'Chili vegano de feijão',
    'Vegan bean chili',
    'Chili vegano de frijoles',
  ),
  'Frango grelhado com salada de abacate': text(
    'Frango grelhado com salada de abacate',
    'Grilled chicken with avocado salad',
    'Pollo a la parrilla con ensalada de aguacate',
  ),
  'Carne moida com abobrinha': text(
    'Carne moída com abobrinha',
    'Ground beef with zucchini',
    'Carne molida con calabacín',
  ),
  'Salmao com aspargos e couve-flor': text(
    'Salmão com aspargos e couve-flor',
    'Salmon with asparagus and cauliflower',
    'Salmón con espárragos y coliflor',
  ),
  'Almondegas de frango com couve-flor': text(
    'Almôndegas de frango com couve-flor',
    'Chicken meatballs with cauliflower',
    'Albóndigas de pollo con coliflor',
  ),
  'Bowl keto de tofu com cogumelos': text(
    'Bowl keto de tofu com cogumelos',
    'Keto tofu and mushroom bowl',
    'Bowl keto de tofu con champiñones',
  ),
  'Risoto integral de cogumelos e ervilha': text(
    'Risoto integral de cogumelos e ervilha',
    'Brown rice risotto with mushrooms and peas',
    'Risotto integral de champiñones y guisantes',
  ),
  'Bowl de ovos, arroz, feijao e queijo': text(
    'Bowl de ovos, arroz, feijão e queijo',
    'Egg, rice, bean, and cheese bowl',
    'Bowl de huevos, arroz, frijoles y queso',
  ),
  'Tilapia com arroz, feijao e salada': text(
    'Tilápia com arroz, feijão e salada',
    'Tilapia with rice, beans, and salad',
    'Tilapia con arroz, frijoles y ensalada',
  ),
  'Sardinha com batata-doce e couve': text(
    'Sardinha com batata-doce e couve',
    'Sardines with sweet potato and collard greens',
    'Sardinas con batata y col rizada',
  ),
  'Frango com arroz, feijao e brocolis': text(
    'Frango com arroz, feijão e brócolis',
    'Chicken with rice, beans, and broccoli',
    'Pollo con arroz, frijoles y brócoli',
  ),
  'Patinho com batata-doce e legumes': text(
    'Patinho com batata-doce e legumes',
    'Lean beef with sweet potato and vegetables',
    'Carne magra con batata y verduras',
  ),
  'Iogurte de coco com chia e manga': text(
    'Iogurte de coco com chia e manga',
    'Coconut yogurt with chia and mango',
    'Yogur de coco con chía y mango',
  ),
  'Torrada integral com pasta de amendoim': text(
    'Torrada integral com pasta de amendoim',
    'Whole-grain toast with peanut butter',
    'Tostada integral con crema de cacahuate',
  ),
  'Salada de frutas com castanhas': text(
    'Salada de frutas com castanhas',
    'Fruit salad with mixed nuts',
    'Ensalada de frutas con frutos secos',
  ),
  'Bolinho assado de grao-de-bico': text(
    'Bolinho assado de grão-de-bico',
    'Baked chickpea fritters',
    'Buñuelos de garbanzos al horno',
  ),
  'Vitamina de soja com aveia e morango': text(
    'Vitamina de soja com aveia e morango',
    'Soy smoothie with oats and strawberries',
    'Batido de soja con avena y fresas',
  ),
  'Cottage com pepino e azeite': text(
    'Cottage com pepino e azeite',
    'Cottage cheese with cucumber and olive oil',
    'Queso cottage con pepino y aceite de oliva',
  ),
  'Smoothie keto de coco e cacau': text(
    'Smoothie keto de coco e cacau',
    'Keto coconut and cocoa smoothie',
    'Batido keto de coco y cacao',
  ),
  'Chips de queijo com guacamole': text(
    'Chips de queijo com guacamole',
    'Cheese crisps with guacamole',
    'Chips de queso con guacamole',
  ),
  'Frango desfiado em folhas': text(
    'Frango desfiado em folhas',
    'Shredded chicken lettuce wraps',
    'Pollo desmenuzado en hojas de lechuga',
  ),
  'Wrap de frango com legumes': text(
    'Wrap de frango com legumes',
    'Chicken and vegetable wrap',
    'Wrap de pollo con verduras',
  ),
  'Iogurte com whey e banana': text(
    'Iogurte com whey e banana',
    'Yogurt with whey and banana',
    'Yogur con proteína de suero y banana',
  ),
  'Pate de atum com palitos de legumes': text(
    'Patê de atum com palitos de legumes',
    'Tuna pâté with vegetable sticks',
    'Paté de atún con bastones de verduras',
  ),
  'Curry de lentilha com legumes': text(
    'Curry de lentilha com legumes',
    'Lentil and vegetable curry',
    'Curry de lentejas con verduras',
  ),
  'Tacos de alface com tofu e abacate': text(
    'Tacos de alface com tofu e abacate',
    'Lettuce tacos with tofu and avocado',
    'Tacos de lechuga con tofu y aguacate',
  ),
  'Sopa de grao-de-bico com couve': text(
    'Sopa de grão-de-bico com couve',
    'Chickpea soup with collard greens',
    'Sopa de garbanzos con col rizada',
  ),
  'Tempeh com brocolis e gergelim': text(
    'Tempeh com brócolis e gergelim',
    'Tempeh with broccoli and sesame',
    'Tempeh con brócoli y sésamo',
  ),
  'Abobrinha recheada com quinoa e feijao': text(
    'Abobrinha recheada com quinoa e feijão',
    'Zucchini stuffed with quinoa and beans',
    'Calabacín relleno de quinoa y frijoles',
  ),
  'Omelete de cogumelos com salada': text(
    'Omelete de cogumelos com salada',
    'Mushroom omelet with salad',
    'Omelet de champiñones con ensalada',
  ),
  'Bife com salada grega': text(
    'Bife com salada grega',
    'Steak with Greek salad',
    'Bistec con ensalada griega',
  ),
  'Camarao com abobrinha ao pesto': text(
    'Camarão com abobrinha ao pesto',
    'Shrimp with pesto zucchini',
    'Camarones con calabacín al pesto',
  ),
  'Frango ao coco com couve-flor': text(
    'Frango ao coco com couve-flor',
    'Coconut chicken with cauliflower',
    'Pollo al coco con coliflor',
  ),
  'Lasanha low carb de berinjela e ricota': text(
    'Lasanha low carb de berinjela e ricota',
    'Low-carb eggplant and ricotta lasagna',
    'Lasaña baja en carbohidratos de berenjena y ricota',
  ),
  'Shakshuka com pao integral': text(
    'Shakshuka com pão integral',
    'Shakshuka with whole-grain bread',
    'Shakshuka con pan integral',
  ),
  'Bowl caprese com grao-de-bico': text(
    'Bowl caprese com grão-de-bico',
    'Caprese chickpea bowl',
    'Bowl caprese con garbanzos',
  ),
  'Salmao com quinoa e legumes': text(
    'Salmão com quinoa e legumes',
    'Salmon with quinoa and vegetables',
    'Salmón con quinoa y verduras',
  ),
  'Atum com salada e batata': text(
    'Atum com salada e batata',
    'Tuna with salad and potato',
    'Atún con ensalada y papa',
  ),
  'Frango com legumes de forno': text(
    'Frango com legumes de forno',
    'Chicken with roasted vegetables',
    'Pollo con verduras al horno',
  ),
  'Carne de panela com abobora': text(
    'Carne de panela com abóbora',
    'Braised beef with pumpkin',
    'Carne guisada con calabaza',
  ),
  'Pudim de chia com coco': text(
    'Pudim de chia com coco',
    'Coconut chia pudding',
    'Pudín de chía con coco',
  ),
  'Leite vegetal com cacau e castanhas': text(
    'Leite vegetal com cacau e castanhas',
    'Plant milk with cocoa and mixed nuts',
    'Leche vegetal con cacao y frutos secos',
  ),
  'Creme de tofu com morango': text(
    'Creme de tofu com morango',
    'Tofu cream with strawberries',
    'Crema de tofu con fresas',
  ),
  'Abacate com limao e sementes': text(
    'Abacate com limão e sementes',
    'Avocado with lemon and seeds',
    'Aguacate con limón y semillas',
  ),
  'Cottage com canela e nozes': text(
    'Cottage com canela e nozes',
    'Cottage cheese with cinnamon and walnuts',
    'Queso cottage con canela y nueces',
  ),
  'Ovos mexidos leves': text(
    'Ovos mexidos leves',
    'Light scrambled eggs',
    'Huevos revueltos ligeros',
  ),
  'Gelatina sem acucar com iogurte grego': text(
    'Gelatina sem açúcar com iogurte grego',
    'Sugar-free gelatin with Greek yogurt',
    'Gelatina sin azúcar con yogur griego',
  ),
  'Queijo com abacate': text('Queijo com abacate', 'Cheese with avocado', 'Queso con aguacate'),
  'Kefir com banana e canela': text(
    'Kefir com banana e canela',
    'Kefir with banana and cinnamon',
    'Kéfir con banana y canela',
  ),
  'Sardinha com folhas': text(
    'Sardinha com folhas',
    'Sardines with leafy greens',
    'Sardinas con hojas verdes',
  ),
  'Overnight de aveia com maca e kefir': text(
    'Overnight de aveia com maçã e kefir',
    'Overnight oats with apple and kefir',
    'Avena nocturna con manzana y kéfir',
  ),
  'Bowl de acai proteico sem xarope': text(
    'Bowl de açaí proteico sem xarope',
    'Protein açaí bowl without syrup',
    'Bowl proteico de açaí sin jarabe',
  ),
  'Crepioca de frango e cottage': text(
    'Crepioca de frango e cottage',
    'Chicken and cottage cheese crepioca',
    'Crepioca de pollo y queso cottage',
  ),
  'Cuscuz com sardinha e tomate': text(
    'Cuscuz com sardinha e tomate',
    'Corn couscous with sardines and tomato',
    'Cuscús con sardinas y tomate',
  ),
  'Pao integral com ovos e abacate': text(
    'Pão integral com ovos e abacate',
    'Whole-grain bread with eggs and avocado',
    'Pan integral con huevos y aguacate',
  ),
  'Bowl low carb de ovos queijo e folhas': text(
    'Bowl low carb de ovos, queijo e folhas',
    'Low-carb egg, cheese, and greens bowl',
    'Bowl bajo en carbohidratos de huevos, queso y hojas verdes',
  ),
  'Smoothie de kefir com frutas vermelhas': text(
    'Smoothie de kefir com frutas vermelhas',
    'Kefir smoothie with berries',
    'Batido de kéfir con frutos rojos',
  ),
  'Salada proteica de edamame': text(
    'Salada proteica de edamame',
    'Protein edamame salad',
    'Ensalada proteica de edamame',
  ),
  'Wrap frio de atum e folhas': text(
    'Wrap frio de atum e folhas',
    'Cold tuna and greens wrap',
    'Wrap frío de atún y hojas verdes',
  ),
  'Ovo cozido com tomate-cereja': text(
    'Ovo cozido com tomate-cereja',
    'Hard-boiled egg with cherry tomatoes',
    'Huevo cocido con tomates cherry',
  ),
  'Pera com cottage e castanhas': text(
    'Pera com cottage e castanhas',
    'Pear with cottage cheese and mixed nuts',
    'Pera con queso cottage y frutos secos',
  ),
  'Mini homus com crackers integrais': text(
    'Mini homus com crackers integrais',
    'Mini hummus with whole-grain crackers',
    'Mini hummus con galletas integrales',
  ),
  'Bowl mediterraneo de frango e quinoa': text(
    'Bowl mediterrâneo de frango e quinoa',
    'Mediterranean chicken and quinoa bowl',
    'Bowl mediterráneo de pollo y quinoa',
  ),
  'Poke de salmao com arroz e manga': text(
    'Poke de salmão com arroz e manga',
    'Salmon poke with rice and mango',
    'Poke de salmón con arroz y mango',
  ),
  'Escondidinho vegano de lentilha': text(
    'Escondidinho vegano de lentilha',
    'Vegan lentil shepherd’s pie',
    'Pastel vegano de lentejas',
  ),
  'Bife acebolado com arroz feijao e salada': text(
    'Bife acebolado com arroz, feijão e salada',
    'Steak with onions, rice, beans, and salad',
    'Bistec con cebolla, arroz, frijoles y ensalada',
  ),
  'Macarrao integral com atum e legumes': text(
    'Macarrão integral com atum e legumes',
    'Whole-wheat pasta with tuna and vegetables',
    'Pasta integral con atún y verduras',
  ),
  'Hamburguer caseiro com salada keto': text(
    'Hambúrguer caseiro com salada keto',
    'Homemade burger with keto salad',
    'Hamburguesa casera con ensalada keto',
  ),
  'Tapioca de banana e pasta de amendoim': text(
    'Tapioca de banana e pasta de amendoim',
    'Banana and peanut butter tapioca',
    'Tapioca de banana y crema de cacahuate',
  ),
  'Muffin salgado de ovos e legumes': text(
    'Muffin salgado de ovos e legumes',
    'Savory egg and vegetable muffin',
    'Muffin salado de huevo y verduras',
  ),
  'Sanduiche integral de atum e ricota': text(
    'Sanduíche integral de atum e ricota',
    'Whole-grain tuna and ricotta sandwich',
    'Sándwich integral de atún y ricota',
  ),
  'Shake de whey com aveia e morango': text(
    'Shake de whey com aveia e morango',
    'Whey shake with oats and strawberries',
    'Batido de proteína de suero con avena y fresas',
  ),
  'Palitos de legumes com guacamole': text(
    'Palitos de legumes com guacamole',
    'Vegetable sticks with guacamole',
    'Bastones de verduras con guacamole',
  ),
  'Rolinhos de alface com frango e cottage': text(
    'Rolinhos de alface com frango e cottage',
    'Lettuce rolls with chicken and cottage cheese',
    'Rollitos de lechuga con pollo y queso cottage',
  ),
  'Sopa proteica de frango com legumes': text(
    'Sopa proteica de frango com legumes',
    'High-protein chicken and vegetable soup',
    'Sopa proteica de pollo con verduras',
  ),
  'Tabule de quinoa com grao-de-bico': text(
    'Tabule de quinoa com grão-de-bico',
    'Quinoa tabbouleh with chickpeas',
    'Tabulé de quinoa con garbanzos',
  ),
  'Omelete caprese low carb': text(
    'Omelete caprese low carb',
    'Low-carb Caprese omelet',
    'Omelet caprese bajo en carbohidratos',
  ),
  'Moqueca leve de tilapia com couve-flor': text(
    'Moqueca leve de tilápia com couve-flor',
    'Light tilapia moqueca with cauliflower',
    'Moqueca ligera de tilapia con coliflor',
  ),
  'Tofu thai com legumes e arroz': text(
    'Tofu thai com legumes e arroz',
    'Thai tofu with vegetables and rice',
    'Tofu tailandés con verduras y arroz',
  ),
  'Carne desfiada com pure de abobora': text(
    'Carne desfiada com purê de abóbora',
    'Shredded beef with pumpkin purée',
    'Carne desmenuzada con puré de calabaza',
  ),
  'Mousse de tofu com cacau': text(
    'Mousse de tofu com cacau',
    'Tofu chocolate mousse',
    'Mousse de tofu con cacao',
  ),
  'Iogurte proteico com morango': text(
    'Iogurte proteico com morango',
    'High-protein yogurt with strawberries',
    'Yogur proteico con fresas',
  ),
  'Caldo leve de legumes com frango': text(
    'Caldo leve de legumes com frango',
    'Light vegetable and chicken soup',
    'Caldo ligero de verduras con pollo',
  ),
  'Creme de abacate com cacau': text(
    'Creme de abacate com cacau',
    'Avocado cocoa cream',
    'Crema de aguacate con cacao',
  ),
  'Ricota com tomate e oregano': text(
    'Ricota com tomate e orégano',
    'Ricotta with tomato and oregano',
    'Ricota con tomate y orégano',
  ),
  'Kefir com maracuja e linhaca': text(
    'Kefir com maracujá e linhaça',
    'Kefir with passion fruit and flaxseed',
    'Kéfir con maracuyá y linaza',
  ),
  'Greek yogurt bowl com berries e aveia': text(
    'Bowl de iogurte grego com frutas vermelhas e aveia',
    'Greek yogurt bowl with berries and oats',
    'Bowl de yogur griego con frutos rojos y avena',
  ),
  'Egg toast com abacate e tomate': text(
    'Torrada com ovo, abacate e tomate',
    'Egg toast with avocado and tomato',
    'Tostada con huevo, aguacate y tomate',
  ),
  'Breakfast wrap de peru e ovos': text(
    'Wrap de café da manhã com peru e ovos',
    'Turkey and egg breakfast wrap',
    'Wrap de desayuno con pavo y huevos',
  ),
  'Breakfast burrito de frango feijao e ovos': text(
    'Burrito de café da manhã com frango, feijão e ovos',
    'Chicken, bean, and egg breakfast burrito',
    'Burrito de desayuno con pollo, frijoles y huevos',
  ),
  'Cottage com banana pasta de amendoim e canela': text(
    'Cottage com banana, pasta de amendoim e canela',
    'Cottage cheese with banana, peanut butter, and cinnamon',
    'Queso cottage con banana, crema de cacahuate y canela',
  ),
  'Nordic toast de salmao ovos e cottage': text(
    'Torrada nórdica de salmão, ovos e cottage',
    'Nordic toast with salmon, eggs, and cottage cheese',
    'Tostada nórdica con salmón, huevos y queso cottage',
  ),
  'English breakfast leve com ovos feijao e toast': text(
    'Café da manhã inglês leve com ovos, feijão e torrada',
    'Light English breakfast with eggs, beans, and toast',
    'Desayuno inglés ligero con huevos, frijoles y tostada',
  ),
  'Omelete de presunto queijo e folhas': text(
    'Omelete de presunto, queijo e folhas',
    'Ham, cheese, and greens omelet',
    'Omelet de jamón, queso y hojas verdes',
  ),
  'Protein pancakes com cottage e berries': text(
    'Panquecas proteicas com cottage e frutas vermelhas',
    'Protein pancakes with cottage cheese and berries',
    'Panqueques proteicos con queso cottage y frutos rojos',
  ),
  'Tapioca brasileira de carne desfiada e queijo': text(
    'Tapioca brasileira de carne desfiada e queijo',
    'Brazilian tapioca with shredded beef and cheese',
    'Tapioca brasileña con carne desmenuzada y queso',
  ),
  'Rolinhos de peru com maca e cottage': text(
    'Rolinhos de peru com maçã e cottage',
    'Turkey rolls with apple and cottage cheese',
    'Rollitos de pavo con manzana y queso cottage',
  ),
  'Skyr ou iogurte grego com pera e nozes': text(
    'Skyr ou iogurte grego com pera e nozes',
    'Skyr or Greek yogurt with pear and walnuts',
    'Skyr o yogur griego con pera y nueces',
  ),
  'Ovos cozidos com queijo e pepino': text(
    'Ovos cozidos com queijo e pepino',
    'Hard-boiled eggs with cheese and cucumber',
    'Huevos cocidos con queso y pepino',
  ),
  'Mini pita de homus e ricota': text(
    'Mini pita de homus e ricota',
    'Mini hummus and ricotta pita',
    'Mini pita de hummus y ricota',
  ),
  'Tuna rice cakes com tomate': text(
    'Bolinhos de arroz com atum e tomate',
    'Tuna rice cakes with tomato',
    'Tortitas de arroz con atún y tomate',
  ),
  'Chicken salad cup com abacate': text(
    'Cestinha de salada de frango com abacate',
    'Chicken salad cup with avocado',
    'Cestita de ensalada de pollo con aguacate',
  ),
  'Queijo minas com banana e sementes': text(
    'Queijo minas com banana e sementes',
    'Minas cheese with banana and seeds',
    'Queso Minas con banana y semillas',
  ),
  'Beef snack bowl com tomate e folhas': text(
    'Bowl de lanche com carne, tomate e folhas',
    'Beef snack bowl with tomato and greens',
    'Bowl de carne con tomate y hojas verdes',
  ),
  'Chicken burrito bowl global': text(
    'Bowl de burrito de frango',
    'Chicken burrito bowl',
    'Bowl de burrito de pollo',
  ),
  'Turkey meatballs com pasta integral': text(
    'Almôndegas de peru com massa integral',
    'Turkey meatballs with whole-wheat pasta',
    'Albóndigas de pavo con pasta integral',
  ),
  'Beef stir fry com arroz e brocolis': text(
    'Carne salteada com arroz e brócolis',
    'Beef stir-fry with rice and broccoli',
    'Salteado de carne con arroz y brócoli',
  ),
  'Greek chicken plate com batatas e salada': text(
    'Prato grego de frango com batatas e salada',
    'Greek chicken plate with potatoes and salad',
    'Plato griego de pollo con papas y ensalada',
  ),
  'PF brasileiro de bife arroz feijao e couve': text(
    'PF brasileiro de bife, arroz, feijão e couve',
    'Brazilian steak plate with rice, beans, and collard greens',
    'Plato brasileño de bistec, arroz, frijoles y col rizada',
  ),
  'Chicken caesar bowl com quinoa': text(
    'Bowl Caesar de frango com quinoa',
    'Chicken Caesar bowl with quinoa',
    'Bowl César de pollo con quinoa',
  ),
  'Lombo suino magro com batatas e vagem': text(
    'Lombo suíno magro com batatas e vagem',
    'Lean pork loin with potatoes and green beans',
    'Lomo de cerdo magro con papas y judías verdes',
  ),
  'Chicken tikka bowl com arroz e pepino': text(
    'Bowl de frango tikka com arroz e pepino',
    'Chicken tikka bowl with rice and cucumber',
    'Bowl de pollo tikka con arroz y pepino',
  ),
  'Pasta italiana com frango tomate e ricota': text(
    'Massa italiana com frango, tomate e ricota',
    'Italian pasta with chicken, tomato, and ricotta',
    'Pasta italiana con pollo, tomate y ricota',
  ),
  'Salmon rice bowl com pepino e manga': text(
    'Bowl de arroz com salmão, pepino e manga',
    'Salmon rice bowl with cucumber and mango',
    'Bowl de arroz con salmón, pepino y mango',
  ),
  'Tuna nicoise com batata ovos e vagem': text(
    'Atum à niçoise com batata, ovos e vagem',
    'Tuna Niçoise with potato, eggs, and green beans',
    'Atún niçoise con papa, huevos y judías verdes',
  ),
  'Vegetarian chili com arroz e queijo': text(
    'Chili vegetariano com arroz e queijo',
    'Vegetarian chili with rice and cheese',
    'Chili vegetariano con arroz y queso',
  ),
  'Halloumi ou queijo grelhado com lentilha': text(
    'Halloumi ou queijo grelhado com lentilha',
    'Halloumi or grilled cheese with lentils',
    'Halloumi o queso a la plancha con lentejas',
  ),
  'Fried rice vegetariano com ovos e tofu': text(
    'Arroz frito vegetariano com ovos e tofu',
    'Vegetarian fried rice with eggs and tofu',
    'Arroz frito vegetariano con huevos y tofu',
  ),
  'Turkey cottage wrap com cenoura': text(
    'Wrap de peru e cottage com cenoura',
    'Turkey and cottage cheese wrap with carrot',
    'Wrap de pavo y queso cottage con zanahoria',
  ),
  'Egg salad toast leve': text(
    'Torrada leve com salada de ovos',
    'Light egg salad toast',
    'Tostada ligera con ensalada de huevo',
  ),
  'Yogurt parfait global com granola e fruta': text(
    'Parfait de iogurte com granola e fruta',
    'Yogurt parfait with granola and fruit',
    'Parfait de yogur con granola y fruta',
  ),
  'Tuna avocado lettuce cups': text(
    'Cestinhas de alface com atum e abacate',
    'Tuna and avocado lettuce cups',
    'Cestitas de lechuga con atún y aguacate',
  ),
  'Mini bowl de frango milho e feijao': text(
    'Mini bowl de frango, milho e feijão',
    'Mini chicken, corn, and bean bowl',
    'Mini bowl de pollo, maíz y frijoles',
  ),
  'Ricotta toast com tomate e sementes': text(
    'Torrada de ricota com tomate e sementes',
    'Ricotta toast with tomato and seeds',
    'Tostada de ricota con tomate y semillas',
  ),
  'Beef lettuce bites com queijo': text(
    'Porções de alface com carne e queijo',
    'Beef and cheese lettuce bites',
    'Bocados de lechuga con carne y queso',
  ),
  'Shrimp pita snack com iogurte': text(
    'Lanche de pita com camarão e iogurte',
    'Shrimp pita snack with yogurt',
    'Snack de pita con camarones y yogur',
  ),
  'Roast chicken com batatas e legumes': text(
    'Frango assado com batatas e legumes',
    'Roast chicken with potatoes and vegetables',
    'Pollo asado con papas y verduras',
  ),
  'Lean beef bolognese com pasta integral': text(
    'Bolonhesa de carne magra com massa integral',
    'Lean beef Bolognese with whole-wheat pasta',
    'Boloñesa de carne magra con pasta integral',
  ),
  'Steak salad keto com abacate': text(
    'Salada keto de bife com abacate',
    'Keto steak salad with avocado',
    'Ensalada keto de bistec con aguacate',
  ),
  'Turkey burger bowl com batata-doce': text(
    'Bowl de hambúrguer de peru com batata-doce',
    'Turkey burger bowl with sweet potato',
    'Bowl de hamburguesa de pavo con batata',
  ),
  'Cod mediterraneo com batatas e pimentao': text(
    'Bacalhau mediterrâneo com batatas e pimentão',
    'Mediterranean cod with potatoes and bell pepper',
    'Bacalao mediterráneo con papas y pimiento',
  ),
  'Shrimp rice bowl com legumes': text(
    'Bowl de arroz com camarão e legumes',
    'Shrimp rice bowl with vegetables',
    'Bowl de arroz con camarones y verduras',
  ),
  'Lombo suino com arroz feijao e salada': text(
    'Lombo suíno com arroz, feijão e salada',
    'Pork loin with rice, beans, and salad',
    'Lomo de cerdo con arroz, frijoles y ensalada',
  ),
  'Chicken fajita lettuce bowl': text(
    'Bowl de alface com fajita de frango',
    'Chicken fajita lettuce bowl',
    'Bowl de lechuga con fajita de pollo',
  ),
  'Keto burger bowl com ovos': text(
    'Bowl de hambúrguer keto com ovos',
    'Keto burger bowl with eggs',
    'Bowl de hamburguesa keto con huevos',
  ),
  'Frittata mediterranea com salada': text(
    'Frittata mediterrânea com salada',
    'Mediterranean frittata with salad',
    'Frittata mediterránea con ensalada',
  ),
  'Mushroom risotto integral com cottage': text(
    'Risoto integral de cogumelos com cottage',
    'Brown rice mushroom risotto with cottage cheese',
    'Risotto integral de champiñones con queso cottage',
  ),
  'Lentil bolognese com pasta integral': text(
    'Bolonhesa de lentilha com massa integral',
    'Lentil Bolognese with whole-wheat pasta',
    'Boloñesa de lentejas con pasta integral',
  ),
  'Chicken noodle soup integral': text(
    'Sopa de frango com macarrão integral',
    'Whole-wheat chicken noodle soup',
    'Sopa de pollo con fideos integrales',
  ),
  'Salmon tray bake com legumes': text(
    'Salmão assado na assadeira com legumes',
    'Sheet-pan salmon with vegetables',
    'Salmón al horno con verduras',
  ),
  'Cottage casein style com nozes': text(
    'Cottage estilo caseína com nozes',
    'Casein-style cottage cheese with walnuts',
    'Queso cottage estilo caseína con nueces',
  ),
  'Peito de peru com queijo e pepino': text(
    'Peito de peru com queijo e pepino',
    'Turkey breast with cheese and cucumber',
    'Pechuga de pavo con queso y pepino',
  ),
  'Atum com pepino e azeite': text(
    'Atum com pepino e azeite',
    'Tuna with cucumber and olive oil',
    'Atún con pepino y aceite de oliva',
  ),
  'Ricota com berries e sementes': text(
    'Ricota com frutas vermelhas e sementes',
    'Ricotta with berries and seeds',
    'Ricota con frutos rojos y semillas',
  ),
  'Ovos cozidos com abacate e folhas': text(
    'Ovos cozidos com abacate e folhas',
    'Hard-boiled eggs with avocado and greens',
    'Huevos cocidos con aguacate y hojas verdes',
  ),
  'Caldo proteico de carne e legumes': text(
    'Caldo proteico de carne e legumes',
    'High-protein beef and vegetable soup',
    'Caldo proteico de carne y verduras',
  ),
  'Omelete carnivora com queijo': text(
    'Omelete carnívora com queijo',
    'Carnivore cheese omelet',
    'Omelet carnívora con queso',
  ),
  'Ovos cozidos com peito de peru': text(
    'Ovos cozidos com peito de peru',
    'Hard-boiled eggs with turkey breast',
    'Huevos cocidos con pechuga de pavo',
  ),
  'Patinho moido com ovos': text(
    'Patinho moído com ovos',
    'Lean ground beef with eggs',
    'Carne molida magra con huevos',
  ),
  'Iogurte grego com whey': text(
    'Iogurte grego com whey',
    'Greek yogurt with whey protein',
    'Yogur griego con proteína de suero',
  ),
  'Salmao grelhado com camarao': text(
    'Salmão grelhado com camarão',
    'Grilled salmon with shrimp',
    'Salmón a la parrilla con camarones',
  ),
  'Cottage com peito de peru': text(
    'Cottage com peito de peru',
    'Cottage cheese with turkey breast',
    'Queso cottage con pechuga de pavo',
  ),
  'Ovos mexidos com peito de peru': text(
    'Ovos mexidos com peito de peru',
    'Scrambled eggs with turkey breast',
    'Huevos revueltos con pechuga de pavo',
  ),
  'Cottage com ovos cozidos': text(
    'Cottage com ovos cozidos',
    'Cottage cheese with hard-boiled eggs',
    'Queso cottage con huevos cocidos',
  ),
  'Frango grelhado com queijo': text(
    'Frango grelhado com queijo',
    'Grilled chicken with cheese',
    'Pollo a la parrilla con queso',
  ),
  'Queijo minas com peito de peru': text(
    'Queijo minas com peito de peru',
    'Minas cheese with turkey breast',
    'Queso Minas con pechuga de pavo',
  ),
  'Bife grelhado com ovos': text(
    'Bife grelhado com ovos',
    'Grilled steak with eggs',
    'Bistec a la parrilla con huevos',
  ),
  'Iogurte natural com whey': text(
    'Iogurte natural com whey',
    'Plain yogurt with whey protein',
    'Yogur natural con proteína de suero',
  ),
  'Cuscuz brasileiro com tofu e tomate': text(
    'Cuscuz brasileiro com tofu e tomate',
    'Brazilian corn couscous with tofu and tomato',
    'Cuscús brasileño de maíz con tofu y tomate',
  ),
  'Overnight de acai com aveia e chia': text(
    'Overnight de açaí com aveia e chia',
    'Açaí overnight oats with chia',
    'Avena nocturna de açaí con chía',
  ),
  'Edamame com mandioca assada': text(
    'Edamame com mandioca assada',
    'Edamame with roasted cassava',
    'Edamame con yuca asada',
  ),
  'Mini sanduiche de homus com tomate': text(
    'Mini sanduíche de homus com tomate',
    'Mini hummus and tomato sandwich',
    'Mini sándwich de hummus con tomate',
  ),
  'Baiao vegano de arroz feijao e couve': text(
    'Baião vegano de arroz, feijão e couve',
    'Vegan Brazilian rice, beans, and collard greens',
    'Baião vegano de arroz, frijoles y col rizada',
  ),
  'Tofu barbecue com batata-doce e vagem': text(
    'Tofu barbecue com batata-doce e vagem',
    'Barbecue tofu with sweet potato and green beans',
    'Tofu barbacoa con batata y judías verdes',
  ),
  'Bolinho assado de lentilha e mandioca': text(
    'Bolinho assado de lentilha e mandioca',
    'Baked lentil and cassava bites',
    'Bocaditos horneados de lenteja y yuca',
  ),
  'Copo de iogurte de soja com manga e linhaca': text(
    'Copo de iogurte de soja com manga e linhaça',
    'Soy yogurt cup with mango and flaxseed',
    'Vaso de yogur de soja con mango y linaza',
  ),
  'Sloppy joe vegano de lentilha no pao integral': text(
    'Sloppy joe vegano de lentilha no pão integral',
    'Vegan lentil sloppy joe on whole-grain bread',
    'Sloppy joe vegano de lentejas en pan integral',
  ),
  'Ensopado de grao-de-bico com abobora e couve': text(
    'Ensopado de grão-de-bico com abóbora e couve',
    'Chickpea stew with pumpkin and collard greens',
    'Guiso de garbanzos con calabaza y col rizada',
  ),
  'Ovos poche com salmao': text(
    'Ovos poché com salmão',
    'Poached eggs with salmon',
    'Huevos pochados con salmón',
  ),
  'Omelete de frango e cottage': text(
    'Omelete de frango e cottage',
    'Chicken and cottage cheese omelet',
    'Omelet de pollo y queso cottage',
  ),
  'Steak and eggs carnivoro': text(
    'Steak and eggs carnívoro',
    'Carnivore steak and eggs',
    'Bistec con huevos carnívoro',
  ),
  'Ovos assados com ricota e peru': text(
    'Ovos assados com ricota e peru',
    'Baked eggs with ricotta and turkey',
    'Huevos al horno con ricota y pavo',
  ),
  'Panqueca carnivora de ovos e whey': text(
    'Panqueca carnívora de ovos e whey',
    'Carnivore egg and whey pancake',
    'Panqueque carnívoro de huevos y proteína de suero',
  ),
  'Sardinha com ovos mexidos': text(
    'Sardinha com ovos mexidos',
    'Sardines with scrambled eggs',
    'Sardinas con huevos revueltos',
  ),
  'Bowl de ovos queijo e patinho': text(
    'Bowl de ovos, queijo e patinho',
    'Egg, cheese, and lean beef bowl',
    'Bowl de huevos, queso y carne magra',
  ),
  'Atum com ovos cozidos': text(
    'Atum com ovos cozidos',
    'Tuna with hard-boiled eggs',
    'Atún con huevos cocidos',
  ),
  'Rolinhos de peru com cottage': text(
    'Rolinhos de peru com cottage',
    'Turkey and cottage cheese rolls',
    'Rollitos de pavo con queso cottage',
  ),
  'Iogurte grego com queijo cottage': text(
    'Iogurte grego com queijo cottage',
    'Greek yogurt with cottage cheese',
    'Yogur griego con queso cottage',
  ),
  'Sardinha com queijo minas': text(
    'Sardinha com queijo minas',
    'Sardines with Minas cheese',
    'Sardinas con queso Minas',
  ),
  'Camarao frio com ovos': text(
    'Camarão frio com ovos',
    'Chilled shrimp with eggs',
    'Camarones fríos con huevos',
  ),
  'Frango desfiado com ricota': text(
    'Frango desfiado com ricota',
    'Shredded chicken with ricotta',
    'Pollo desmenuzado con ricota',
  ),
  'Bife grelhado com cottage': text(
    'Bife grelhado com cottage',
    'Grilled steak with cottage cheese',
    'Bistec a la parrilla con queso cottage',
  ),
  'Lombo suino com ovos': text(
    'Lombo suíno com ovos',
    'Pork loin with eggs',
    'Lomo de cerdo con huevos',
  ),
  'Salmao assado com cottage': text(
    'Salmão assado com cottage',
    'Baked salmon with cottage cheese',
    'Salmón al horno con queso cottage',
  ),
  'Frango assado com ovos': text(
    'Frango assado com ovos',
    'Roasted chicken with eggs',
    'Pollo asado con huevos',
  ),
  'Patinho em bife com camarao': text(
    'Bife de patinho com camarão',
    'Lean steak with shrimp',
    'Bistec magro con camarones',
  ),
  'Carne de panela magra com queijo': text(
    'Carne de panela magra com queijo',
    'Lean braised beef with cheese',
    'Carne magra guisada con queso',
  ),
  'Almondegas carnivoras de patinho e ovos': text(
    'Almôndegas carnívoras de patinho e ovos',
    'Carnivore lean beef and egg meatballs',
    'Albóndigas carnívoras de carne magra y huevos',
  ),
  'Shake carnivoro de kefir e whey': text(
    'Shake carnívoro de kefir e whey',
    'Carnivore kefir and whey shake',
    'Batido carnívoro de kéfir y proteína de suero',
  ),
  'Ovos recheados com atum': text(
    'Ovos recheados com atum',
    'Tuna-stuffed eggs',
    'Huevos rellenos de atún',
  ),
  'Rolinhos de salmao e cottage': text(
    'Rolinhos de salmão e cottage',
    'Salmon and cottage cheese rolls',
    'Rollitos de salmón y queso cottage',
  ),
  'Queijo minas com sardinha': text(
    'Queijo minas com sardinha',
    'Minas cheese with sardines',
    'Queso Minas con sardinas',
  ),
  'Peito de frango frio com ricota': text(
    'Peito de frango frio com ricota',
    'Chilled chicken breast with ricotta',
    'Pechuga de pollo fría con ricota',
  ),
  'Iogurte grego com cottage e whey': text(
    'Iogurte grego com cottage e whey',
    'Greek yogurt with cottage cheese and whey',
    'Yogur griego con queso cottage y proteína de suero',
  ),
  'Lombo suino com cottage': text(
    'Lombo suíno com cottage',
    'Pork loin with cottage cheese',
    'Lomo de cerdo con queso cottage',
  ),
  'Tilapia grelhada com camarao': text(
    'Tilápia grelhada com camarão',
    'Grilled tilapia with shrimp',
    'Tilapia a la parrilla con camarones',
  ),
  'Carne moida com queijo minas': text(
    'Carne moída com queijo minas',
    'Ground beef with Minas cheese',
    'Carne molida con queso Minas',
  ),
  'Frango grelhado com sardinha': text(
    'Frango grelhado com sardinha',
    'Grilled chicken with sardines',
    'Pollo a la parrilla con sardinas',
  ),
  'Salmao com ovos poche': text(
    'Salmão com ovos poché',
    'Salmon with poached eggs',
    'Salmón con huevos pochados',
  ),
  'Bife com queijo minas': text(
    'Bife com queijo minas',
    'Steak with Minas cheese',
    'Bistec con queso Minas',
  ),
  'Kefir com whey': text(
    'Kefir com whey',
    'Kefir with whey protein',
    'Kéfir con proteína de suero',
  ),
  'Ricota com peito de peru': text(
    'Ricota com peito de peru',
    'Ricotta with turkey breast',
    'Ricota con pechuga de pavo',
  ),
  'Cottage com atum': text(
    'Cottage com atum',
    'Cottage cheese with tuna',
    'Queso cottage con atún',
  ),
  'Ovos mexidos com ricota': text(
    'Ovos mexidos com ricota',
    'Scrambled eggs with ricotta',
    'Huevos revueltos con ricota',
  ),
  'Iogurte grego com peito de peru': text(
    'Iogurte grego com peito de peru',
    'Greek yogurt with turkey breast',
    'Yogur griego con pechuga de pavo',
  ),
  'Queijo minas com frango desfiado': text(
    'Queijo minas com frango desfiado',
    'Minas cheese with shredded chicken',
    'Queso Minas con pollo desmenuzado',
  ),
};

function localizeAmount(amount: string, locale: DietLocale): string {
  const exact: Record<string, LocalizedText> = {
    '1 colher de cha': text('1 colher de chá', '1 teaspoon', '1 cucharadita'),
    '1 colher de sopa': text('1 colher de sopa', '1 tablespoon', '1 cucharada'),
    '1 dente': text('1 dente', '1 clove', '1 diente'),
    '1 lata': text('1 lata', '1 can', '1 lata'),
    '1 unidade': text('1 unidade', '1 unit', '1 unidad'),
    '1 unidade media': text('1 unidade média', '1 medium unit', '1 unidad mediana'),
    '2 fatias': text('2 fatias', '2 slices', '2 rebanadas'),
    '2 unidades': text('2 unidades', '2 units', '2 unidades'),
    '2 xicaras': text('2 xícaras', '2 cups', '2 tazas'),
  };
  const fixed = exact[amount];
  if (fixed) return fixed[locale];

  const counted =
    /^(\d+(?:\/\d+)?) (unidade|unidades|fatia|fatias|folha|folhas|xicara|xicaras|lata|latas|porcao|porcoes)$/.exec(
      amount,
    );
  if (counted) {
    const [, value, canonicalUnit] = counted;
    const singular = canonicalUnit!.replace(/s$/, '');
    const units: Record<string, Record<DietLocale, readonly [string, string]>> = {
      unidade: { pt: ['unidade', 'unidades'], en: ['unit', 'units'], es: ['unidad', 'unidades'] },
      fatia: { pt: ['fatia', 'fatias'], en: ['slice', 'slices'], es: ['rebanada', 'rebanadas'] },
      folha: { pt: ['folha', 'folhas'], en: ['leaf', 'leaves'], es: ['hoja', 'hojas'] },
      xicara: { pt: ['xícara', 'xícaras'], en: ['cup', 'cups'], es: ['taza', 'tazas'] },
      lata: { pt: ['lata', 'latas'], en: ['can', 'cans'], es: ['lata', 'latas'] },
      porcao: {
        pt: ['porção', 'porções'],
        en: ['serving', 'servings'],
        es: ['porción', 'porciones'],
      },
    };
    const [translatedSingular, translatedPlural] = units[singular]![locale];
    return `${value} ${value === '1' || value === '1/2' ? translatedSingular : translatedPlural}`;
  }

  const spoons = /^(\d+) colheres? de (cha|sopa)$/.exec(amount);
  if (spoons) {
    const [, value, size] = spoons;
    const unit =
      size === 'cha'
        ? text('colher de chá', 'teaspoon', 'cucharadita')[locale]
        : text('colher de sopa', 'tablespoon', 'cucharada')[locale];
    return `${value} ${value === '1' ? unit : `${unit}s`}`;
  }

  const measured = /^(\d+) (g|ml)(?: (cozido|cozida|hidratada))?$/.exec(amount);
  if (!measured) return amount;
  const [, value, unit, qualifier] = measured;
  if (!qualifier) return `${value} ${unit}`;
  const qualifiers: Record<string, LocalizedText> = {
    cozido: text('cozido', 'cooked', 'cocido'),
    cozida: text('cozida', 'cooked', 'cocida'),
    hidratada: text('hidratada', 'rehydrated', 'hidratada'),
  };
  return `${value} ${unit} ${qualifiers[qualifier]![locale]}`;
}

function localizeIngredient(ingredient: Ingredient, locale: DietLocale): Ingredient {
  return {
    ...ingredient,
    name: INGREDIENT_NAMES[ingredient.name]?.[locale] ?? ingredient.name,
    amount: localizeAmount(ingredient.amount, locale),
    ...(Array.isArray(ingredient.substitutions)
      ? {
          substitutions: ingredient.substitutions.map((substitution) =>
            localizeIngredient(substitution, locale),
          ),
        }
      : {}),
  };
}

function preparationDetail(
  mealType: string,
  locale: DietLocale,
  canonicalIngredients: Ingredient[],
): string {
  const animalFoods = canonicalIngredients
    .map((ingredient) => ingredient.name)
    .join(' ')
    .toLowerCase();

  if (/(peito de frango|frango desfiado|frango moido|peito de peru|marreco)/.test(animalFoods)) {
    return text(
      'Cozinhe frango e peru até atingir 74 °C no centro; refrigere as sobras em até duas horas.',
      'Cook chicken and turkey to 165 °F (74 °C) internally; refrigerate leftovers within two hours.',
      'Cocina el pollo y el pavo hasta alcanzar 74 °C (165 °F) en el centro; refrigera las sobras antes de dos horas.',
    )[locale];
  }
  if (/(patinho moido|ovos|charque magro|mortadela)/.test(animalFoods)) {
    return text(
      'Cozinhe carne moída e preparações com ovos até atingir 71 °C no centro; em ovos simples, firme clara e gema.',
      'Cook ground meat and egg dishes to 160 °F (71 °C) internally; for plain eggs, firm both white and yolk.',
      'Cocina la carne molida y los platos con huevo hasta alcanzar 71 °C (160 °F); en huevos simples, cuaja la clara y la yema.',
    )[locale];
  }
  if (
    /(atum|tilapia|sardinha|camarao|salmao|pescada branca|linguado|bacalhau|tainha|berbigao|ostras)/.test(
      animalFoods,
    )
  ) {
    return text(
      'Cozinhe peixes e frutos do mar até 63 °C no centro ou até a carne ficar opaca e separar facilmente.',
      'Cook fish and seafood to 145 °F (63 °C) internally or until the flesh is opaque and separates easily.',
      'Cocina pescados y mariscos hasta alcanzar 63 °C (145 °F) o hasta que la carne quede opaca y se separe fácilmente.',
    )[locale];
  }
  if (/(patinho em bife|carne de panela magra|lombo suino magro)/.test(animalFoods)) {
    return text(
      'Cozinhe cortes inteiros de boi ou porco até 63 °C no centro e deixe descansar por 3 minutos antes de servir.',
      'Cook whole cuts of beef or pork to 145 °F (63 °C) internally and rest for 3 minutes before serving.',
      'Cocina los cortes enteros de res o cerdo hasta alcanzar 63 °C (145 °F) y déjalos reposar 3 minutos antes de servir.',
    )[locale];
  }
  if (/(iogurte|queijo|ricota|kefir|whey)/.test(animalFoods)) {
    return text(
      'Mantenha os laticínios refrigerados e não deixe a preparação fora da geladeira por mais de duas horas.',
      'Keep dairy refrigerated and do not leave the preparation out of the refrigerator for more than two hours.',
      'Mantén los lácteos refrigerados y no dejes la preparación fuera del refrigerador por más de dos horas.',
    )[locale];
  }
  if (mealType === 'BREAKFAST') {
    return text(
      'Para agilizar a manhã, deixe frutas lavadas e bases cozidas ou porcionadas na noite anterior.',
      'To save time in the morning, wash the fruit and cook or portion the bases the night before.',
      'Para ahorrar tiempo por la mañana, lava la fruta y deja las bases cocidas o porcionadas la noche anterior.',
    )[locale];
  }
  if (mealType === 'MORNING_SNACK' || mealType === 'AFTERNOON_SNACK') {
    return text(
      'Leve em um pote fechado e mantenha refrigerado quando houver laticínios, ovos, peixe ou frango.',
      'Carry it in a sealed container and keep it refrigerated when it contains dairy, eggs, fish, or chicken.',
      'Llévalo en un recipiente cerrado y mantenlo refrigerado cuando contenga lácteos, huevos, pescado o pollo.',
    )[locale];
  }
  if (mealType === 'SUPPER') {
    return text(
      'Mantenha a porção leve e evite acrescentar açúcar, mel ou granola além do planejado.',
      'Keep the portion light and avoid adding sugar, honey, or granola beyond the planned amount.',
      'Mantén la porción ligera y evita agregar azúcar, miel o granola fuera de lo planificado.',
    )[locale];
  }
  return text(
    'Para levar em uma marmita, deixe esfriar antes de tampar e mantenha molhos, folhas ou itens crocantes separados até servir.',
    'For a packed meal, let it cool before sealing and keep sauces, leafy greens, or crunchy items separate until serving.',
    'Para llevarlo en un recipiente, deja que se enfríe antes de cerrarlo y mantén las salsas, las hojas o los ingredientes crujientes separados hasta servir.',
  )[locale];
}

function localizedPreparationSteps(
  canonicalName: string,
  mealType: string,
  ingredients: Ingredient[],
  canonicalIngredients: Ingredient[],
  locale: DietLocale,
): string[] {
  const lowerName = canonicalName.toLowerCase();
  const name = RECIPE_NAMES[canonicalName]?.[locale] ?? canonicalName;
  const main =
    ingredients[0]?.name ??
    text('ingrediente principal', 'main ingredient', 'ingrediente principal')[locale];
  const second = ingredients[1]?.name ?? text('base', 'base', 'base')[locale];
  const third = ingredients[2]?.name ?? text('acompanhamento', 'side', 'acompañamiento')[locale];
  let result: string[];

  if (/(smoothie|shake|vitamina)/.test(lowerName)) {
    result = [
      text(
        `Separe ${main}, ${second} e ${third}; lave frutas e folhas antes de usar.`,
        `Set out ${main}, ${second}, and ${third}; wash fruit and leafy greens before use.`,
        `Prepara ${main}, ${second} y ${third}; lava las frutas y las hojas antes de usarlas.`,
      )[locale],
      text(
        'Bata tudo no liquidificador com água, gelo ou a bebida indicada até ficar cremoso.',
        'Blend everything with water, ice, or the indicated drink until creamy.',
        'Licúa todo con agua, hielo o la bebida indicada hasta obtener una textura cremosa.',
      )[locale],
      text(
        'Ajuste a textura com mais líquido, se necessário, e sirva imediatamente.',
        'Adjust the texture with more liquid if needed and serve immediately.',
        'Ajusta la textura con más líquido si es necesario y sirve de inmediato.',
      )[locale],
      text(
        'Para variar, troque um ingrediente por uma das substituições indicadas, mantendo a porção.',
        'For variety, replace one ingredient with an indicated substitute while keeping the same portion.',
        'Para variar, cambia un ingrediente por uno de los sustitutos indicados, manteniendo la porción.',
      )[locale],
    ];
  } else if (/(iogurte|kefir)/.test(lowerName)) {
    result = [
      text(
        `Coloque ${main} em uma tigela ou pote individual.`,
        `Place ${main} in an individual bowl or container.`,
        `Coloca ${main} en un tazón o recipiente individual.`,
      )[locale],
      text(
        `Misture ${second} e finalize com ${third}, mantendo as porções indicadas.`,
        `Mix in ${second} and finish with ${third}, keeping the indicated portions.`,
        `Mezcla ${second} y termina con ${third}, respetando las porciones indicadas.`,
      )[locale],
      text(
        'Deixe gelar por alguns minutos se quiser uma textura mais firme.',
        'Chill for a few minutes if you prefer a firmer texture.',
        'Refrigera durante unos minutos si prefieres una textura más firme.',
      )[locale],
      text(
        'Use as substituições indicadas para trocar a fruta, as sementes ou a base láctea.',
        'Use the indicated substitutions to replace the fruit, seeds, or dairy base.',
        'Usa los sustitutos indicados para cambiar la fruta, las semillas o la base láctea.',
      )[locale],
    ];
  } else if (/mingau/.test(lowerName)) {
    result = [
      text(
        `Aqueça ${main} com ${second} em fogo baixo, mexendo até engrossar.`,
        `Heat ${main} with ${second} over low heat, stirring until thickened.`,
        `Calienta ${main} con ${second} a fuego bajo, removiendo hasta que espese.`,
      )[locale],
      text(
        `Misture ${third} no final para preservar a textura e as fibras.`,
        `Stir in ${third} at the end to preserve texture and fiber.`,
        `Incorpora ${third} al final para conservar la textura y la fibra.`,
      )[locale],
      text(
        'Desligue o fogo quando estiver cremoso e acrescente canela ou cacau sem açúcar, se desejar.',
        'Remove from the heat when creamy and add cinnamon or unsweetened cocoa if desired.',
        'Retira del fuego cuando esté cremoso y agrega canela o cacao sin azúcar si lo deseas.',
      )[locale],
      text(
        'Sirva quente e troque a fruta ou a semente pelas substituições indicadas.',
        'Serve warm and replace the fruit or seed with an indicated substitute if desired.',
        'Sirve caliente y cambia la fruta o la semilla por uno de los sustitutos indicados.',
      )[locale],
    ];
  } else if (/(omelete|ovos|tofu mexido|shakshuka)/.test(lowerName)) {
    result = [
      text(
        `Aqueça uma frigideira antiaderente e prepare ${main} em fogo médio.`,
        `Heat a nonstick skillet and cook ${main} over medium heat.`,
        `Calienta una sartén antiadherente y cocina ${main} a fuego medio.`,
      )[locale],
      text(
        `Adicione ${second} e ${third}, mexendo ou dobrando conforme o prato pedir.`,
        `Add ${second} and ${third}, stirring or folding as appropriate for the dish.`,
        `Agrega ${second} y ${third}, removiendo o doblando según lo requiera el plato.`,
      )[locale],
      text(
        'Cozinhe até firmar, evitando excesso de óleo para manter as calorias previstas.',
        'Cook until set, avoiding excess oil to keep the planned calorie count.',
        'Cocina hasta que cuaje y evita el exceso de aceite para mantener las calorías previstas.',
      )[locale],
      text(
        'Finalize com ervas, limão ou pimenta e use as substituições indicadas para variar.',
        'Finish with herbs, lemon, or pepper and use the indicated substitutions for variety.',
        'Termina con hierbas, limón o pimienta y usa los sustitutos indicados para variar.',
      )[locale],
    ];
  } else if (/(tapioca|panqueca|cuscuz)/.test(lowerName)) {
    result = [
      text(
        `Prepare ${main} em uma frigideira ou cuscuzeira até ficar cozido e firme.`,
        `Cook ${main} in a skillet or couscous steamer until done and firm.`,
        `Prepara ${main} en una sartén o cuscusera hasta que esté cocido y firme.`,
      )[locale],
      text(
        `Adicione ${second} e ${third} como recheio ou acompanhamento.`,
        `Add ${second} and ${third} as a filling or side.`,
        `Agrega ${second} y ${third} como relleno o acompañamiento.`,
      )[locale],
      text(
        'Mantenha o fogo médio para não ressecar e respeite a quantidade indicada.',
        'Keep the heat at medium to prevent drying and follow the indicated amount.',
        'Mantén el fuego medio para evitar que se seque y respeta la cantidad indicada.',
      )[locale],
      text(
        'Troque o recheio ou a base pelas substituições indicadas, mantendo a porção sugerida.',
        'Replace the filling or base with an indicated substitute while keeping the suggested portion.',
        'Cambia el relleno o la base por uno de los sustitutos indicados, manteniendo la porción sugerida.',
      )[locale],
    ];
  } else if (/(sanduiche|wrap|rolinhos|tacos)/.test(lowerName)) {
    result = [
      text(
        `Abra a base e distribua ${main} de maneira uniforme.`,
        `Open the base and spread ${main} evenly.`,
        `Abre la base y distribuye ${main} de manera uniforme.`,
      )[locale],
      text(
        `Acrescente ${second} e ${third}, deixando a montagem firme para facilitar o consumo.`,
        `Add ${second} and ${third}, keeping the assembly firm and easy to eat.`,
        `Agrega ${second} y ${third}, dejando el conjunto firme para comerlo con facilidad.`,
      )[locale],
      text(
        'Dobre, enrole ou feche o sanduíche e aqueça rapidamente, se for adequado ao prato.',
        'Fold, roll, or close the sandwich and warm it briefly if appropriate for the dish.',
        'Dobla, enrolla o cierra el sándwich y caliéntalo brevemente si corresponde al plato.',
      )[locale],
      text(
        'Use as substituições indicadas para variar a proteína, a base ou os vegetais.',
        'Use the indicated substitutions to vary the protein, base, or vegetables.',
        'Usa los sustitutos indicados para variar la proteína, la base o las verduras.',
      )[locale],
    ];
  } else if (/(mix|salada de frutas|fruta com)/.test(lowerName)) {
    result = [
      text(
        `Porcione ${main} e ${second} em um pote ou tigela.`,
        `Portion ${main} and ${second} into a container or bowl.`,
        `Sirve ${main} y ${second} en un recipiente o tazón.`,
      )[locale],
      text(
        `Acrescente ${third} para dar crocância e aumentar a saciedade.`,
        `Add ${third} for crunch and greater satiety.`,
        `Agrega ${third} para aportar una textura crujiente y aumentar la saciedad.`,
      )[locale],
      text(
        'Misture apenas na hora de comer para preservar a textura.',
        'Mix only when ready to eat to preserve the texture.',
        'Mezcla justo antes de comer para conservar la textura.',
      )[locale],
      text(
        'Substitua frutas, sementes ou gorduras boas usando as opções indicadas.',
        'Replace fruit, seeds, or healthy fats using the indicated options.',
        'Sustituye frutas, semillas o grasas saludables con las opciones indicadas.',
      )[locale],
    ];
  } else if (/(homus|pate|guacamole|abacate)/.test(lowerName)) {
    result = [
      text(
        `Amasse ou misture ${main} com ${second} até formar uma pasta cremosa.`,
        `Mash or mix ${main} with ${second} until creamy.`,
        `Tritura o mezcla ${main} con ${second} hasta obtener una pasta cremosa.`,
      )[locale],
      text(
        `Sirva com ${third} ou use como recheio, respeitando a porção indicada.`,
        `Serve with ${third} or use as a filling, following the indicated portion.`,
        `Sirve con ${third} o úsalo como relleno, respetando la porción indicada.`,
      )[locale],
      text(
        'Tempere com limão, alho, ervas ou vinagre sem acrescentar molhos calóricos.',
        'Season with lemon, garlic, herbs, or vinegar without adding high-calorie sauces.',
        'Condimenta con limón, ajo, hierbas o vinagre sin agregar salsas calóricas.',
      )[locale],
      text(
        'Troque a base, o vegetal ou a gordura boa por uma substituição indicada.',
        'Replace the base, vegetable, or healthy fat with an indicated substitute.',
        'Cambia la base, la verdura o la grasa saludable por uno de los sustitutos indicados.',
      )[locale],
    ];
  } else if (/(pudim|creme|gelatina|leite vegetal)/.test(lowerName)) {
    result = [
      text(
        `Misture ${main} com ${second} até incorporar bem.`,
        `Mix ${main} with ${second} until fully combined.`,
        `Mezcla ${main} con ${second} hasta integrar bien.`,
      )[locale],
      text(
        `Acrescente ${third} e leve para gelar quando o preparo precisar ganhar consistência.`,
        `Add ${third} and chill when the preparation needs to set.`,
        `Agrega ${third} y refrigera cuando la preparación necesite adquirir consistencia.`,
      )[locale],
      text(
        'Sirva frio em uma porção individual para facilitar o controle de calorias.',
        'Serve cold in an individual portion to make calorie control easier.',
        'Sirve frío en una porción individual para facilitar el control de calorías.',
      )[locale],
      text(
        'Use as substituições indicadas para variar a base, a fruta ou as sementes.',
        'Use the indicated substitutions to vary the base, fruit, or seeds.',
        'Usa los sustitutos indicados para variar la base, la fruta o las semillas.',
      )[locale],
    ];
  } else if (/(sopa|curry|chili|feijoada|moqueca|carne de panela)/.test(lowerName)) {
    result = [
      text(
        `Refogue os temperos com pouco óleo e adicione ${main}.`,
        `Sauté the seasonings with a small amount of oil and add ${main}.`,
        `Sofríe los condimentos con poco aceite y agrega ${main}.`,
      )[locale],
      text(
        `Inclua ${second} e ${third}, cubra parcialmente com água ou caldo leve e cozinhe.`,
        `Add ${second} and ${third}, partially cover with water or light broth, and cook.`,
        `Añade ${second} y ${third}, cubre parcialmente con agua o caldo ligero y cocina.`,
      )[locale],
      text(
        'Mantenha em fogo baixo até os ingredientes ficarem macios e o caldo encorpar.',
        'Keep over low heat until the ingredients are tender and the broth thickens.',
        'Mantén a fuego bajo hasta que los ingredientes estén tiernos y el caldo espese.',
      )[locale],
      text(
        'Ajuste o sal, o limão e as ervas no final; varie com as substituições indicadas.',
        'Adjust salt, lemon, and herbs at the end; use the indicated substitutions for variety.',
        'Ajusta la sal, el limón y las hierbas al final; varía con los sustitutos indicados.',
      )[locale],
    ];
  } else if (/(lasanha|abobrinha recheada|bolinho|chips)/.test(lowerName)) {
    result = [
      text(
        `Prepare ${main} e monte com ${second} e ${third} em uma forma ou assadeira.`,
        `Prepare ${main} and assemble it with ${second} and ${third} in a baking dish or sheet pan.`,
        `Prepara ${main} y móntalo con ${second} y ${third} en un molde o bandeja para horno.`,
      )[locale],
      text(
        'Asse em temperatura média até dourar e a textura ficar firme.',
        'Bake at a moderate temperature until golden and set.',
        'Hornea a temperatura media hasta que se dore y adquiera una textura firme.',
      )[locale],
      text(
        'Deixe descansar por alguns minutos antes de servir para manter o formato.',
        'Let it rest for a few minutes before serving so it keeps its shape.',
        'Deja reposar unos minutos antes de servir para que mantenga la forma.',
      )[locale],
      text(
        'Troque o recheio, o vegetal ou o complemento usando as substituições indicadas.',
        'Replace the filling, vegetable, or side using the indicated substitutions.',
        'Cambia el relleno, la verdura o el complemento con los sustitutos indicados.',
      )[locale],
    ];
  } else if (
    /(salmao|tilapia|sardinha|atum|camarao|bacalhau|tainha|berbigao|ostras|peixada|peixe)/.test(
      lowerName,
    )
  ) {
    result = [
      text(
        `Tempere ${main} com limão, ervas e pouco sal.`,
        `Season ${main} with lemon, herbs, and a small amount of salt.`,
        `Condimenta ${main} con limón, hierbas y poca sal.`,
      )[locale],
      text(
        `Prepare ${second} e ${third} enquanto a proteína grelha, assa ou aquece rapidamente.`,
        `Prepare ${second} and ${third} while the protein grills, bakes, or warms quickly.`,
        `Prepara ${second} y ${third} mientras la proteína se cocina a la parrilla, al horno o se calienta rápidamente.`,
      )[locale],
      text(
        'Cozinhe a proteína até o ponto desejado, sem empanar nem fritar por imersão.',
        'Cook the protein to the desired doneness without breading or deep-frying it.',
        'Cocina la proteína al punto deseado, sin empanarla ni freírla por inmersión.',
      )[locale],
      text(
        'Monte o prato e use as substituições para variar o peixe, a base ou o vegetal.',
        'Assemble the dish and use the substitutions to vary the fish, base, or vegetable.',
        'Monta el plato y usa los sustitutos para variar el pescado, la base o la verdura.',
      )[locale],
    ];
  } else if (
    /(frango|patinho|bife|carne|almondegas|lombo|pernil|marreco|charque|galeto|mortadela)/.test(
      lowerName,
    )
  ) {
    result = [
      text(
        `Tempere ${main} com alho, limão, ervas e pouco sal.`,
        `Season ${main} with garlic, lemon, herbs, and a small amount of salt.`,
        `Condimenta ${main} con ajo, limón, hierbas y poca sal.`,
      )[locale],
      text(
        `Grelhe, asse ou cozinhe a proteína e prepare ${second} e ${third} em paralelo.`,
        `Grill, bake, or cook the protein while preparing ${second} and ${third}.`,
        `Cocina la proteína a la parrilla, al horno o guisada mientras preparas ${second} y ${third}.`,
      )[locale],
      text(
        'Monte o prato com a porção indicada e evite molhos pesados.',
        'Assemble the dish with the indicated portion and avoid heavy sauces.',
        'Monta el plato con la porción indicada y evita las salsas pesadas.',
      )[locale],
      text(
        'Troque a proteína, o carboidrato ou o vegetal pelas substituições indicadas.',
        'Replace the protein, carbohydrate, or vegetable with an indicated substitute.',
        'Cambia la proteína, el carbohidrato o la verdura por uno de los sustitutos indicados.',
      )[locale],
    ];
  } else {
    result = [
      text(
        `Separe os ingredientes de ${name.toLowerCase()} e confira as porções indicadas.`,
        `Set out the ingredients for ${name.toLowerCase()} and check the indicated portions.`,
        `Prepara los ingredientes de ${name.toLowerCase()} y comprueba las porciones indicadas.`,
      )[locale],
      text(
        `Prepare ${main}, ${second} e ${third} usando cozimento, grelha ou uma montagem simples.`,
        `Prepare ${main}, ${second}, and ${third} by cooking, grilling, or assembling them simply.`,
        `Prepara ${main}, ${second} y ${third} mediante cocción, parrilla o un montaje sencillo.`,
      )[locale],
      text(
        'Monte o prato na porção sugerida e ajuste os temperos leves no final.',
        'Assemble the dish in the suggested portion and adjust light seasonings at the end.',
        'Monta el plato con la porción sugerida y ajusta los condimentos ligeros al final.',
      )[locale],
      text(
        'Use uma das substituições indicadas para variar, mantendo a mesma estrutura nutricional.',
        'Use one of the indicated substitutions for variety while keeping the same nutritional structure.',
        'Usa uno de los sustitutos indicados para variar, manteniendo la misma estructura nutricional.',
      )[locale],
    ];
  }

  return [...result, preparationDetail(mealType, locale, canonicalIngredients)];
}

interface LocalizableRecipe {
  name: string;
  mealType: string;
  ingredients?: Ingredient[];
  steps?: string[];
  [key: string]: unknown;
}

export function localizeRecipe<T extends LocalizableRecipe>(recipe: T, locale?: string): T {
  const resolved = resolveDietLocale(locale);
  const localizedName = RECIPE_NAMES[recipe.name];
  if (!localizedName) return recipe;

  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((ingredient) => localizeIngredient(ingredient, resolved))
    : [];

  return {
    ...recipe,
    name: localizedName[resolved],
    ...(Array.isArray(recipe.ingredients) ? { ingredients } : {}),
    ...(Array.isArray(recipe.steps)
      ? {
          steps: localizedPreparationSteps(
            recipe.name,
            recipe.mealType,
            ingredients,
            recipe.ingredients ?? [],
            resolved,
          ),
        }
      : {}),
  };
}

export function localizeMealPlan<T>(plan: T, locale?: string): T {
  if (!plan || typeof plan !== 'object') return plan;
  const resolved = resolveDietLocale(locale);
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;

    const candidate = value as Record<string, unknown>;
    if (typeof candidate.name === 'string' && RECIPE_NAMES[candidate.name]) {
      return localizeRecipe(candidate as LocalizableRecipe, resolved);
    }
    return Object.fromEntries(
      Object.entries(candidate).map(([key, nested]) => [key, visit(nested)]),
    );
  };
  return visit(plan) as T;
}

export const dietCatalogLocalizationCoverage = {
  recipeNames: new Set(Object.keys(RECIPE_NAMES)),
  ingredientNames: new Set(Object.keys(INGREDIENT_NAMES)),
};
