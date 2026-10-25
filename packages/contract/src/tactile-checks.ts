import type { ManualCheck } from "./schemas";
import { normalizeProduceSlug } from "./seasonality";

export interface TactileChecksLocaleCatalog {
  [produceSlug: string]: ManualCheck[];
}

export const TACTILE_CHECKS_CATALOG: Record<"en-GB" | "pt-BR", TactileChecksLocaleCatalog> = {
  "pt-BR": {
    watermelon: [
      {
        trait: "Mancha de solo",
        how: "Procure a mancha onde a melancia repousou na terra",
        whatItMeans: "Amarelo-creme ou dourado indica fruta madura e doce: branca ainda nao amadureceu",
      },
      {
        trait: "Som oco ao bater",
        how: "Bata de leve na lateral com os nos dos dedos",
        whatItMeans: "Som oco e ressonante confirma polpa suculenta: som abafado indica fruto passado",
      },
    ],
    avocado: [
      {
        trait: "Toque suave no topo",
        how: "Pressione suavemente perto do cabinho com o polegar",
        whatItMeans: "Ceder de leve sem afundar indica ponto perfeito para comer hoje ou amanha",
      },
      {
        trait: "Tampa do pedunculo",
        how: "Destaque a tampinha do cabinho no topo",
        whatItMeans: "Verde por baixo confirma pronto para consumo: marrom passou do ponto",
      },
    ],
    melon: [
      {
        trait: "Pressao na base",
        how: "Pressione levemente a extremidade oposta ao cabinho",
        whatItMeans: "Ceder com elasticidade suave confirma polpa macia e pronta para consumo",
      },
      {
        trait: "Aroma doce no fundo",
        how: "Cheire a base do melao",
        whatItMeans: "Aroma doce e floral evidente confirma alto teor de acucar",
      },
    ],
    cantaloupe: [
      {
        trait: "Pressao na base",
        how: "Pressione levemente a extremidade oposta ao cabinho",
        whatItMeans: "Ceder com elasticidade suave confirma polpa macia e pronta para consumo",
      },
      {
        trait: "Aroma doce no fundo",
        how: "Cheire a base do melao",
        whatItMeans: "Aroma doce e floral evidente confirma alto teor de acucar",
      },
    ],
    honeydew: [
      {
        trait: "Pressao na base",
        how: "Pressione levemente a extremidade oposta ao cabinho",
        whatItMeans: "Ceder com elasticidade suave confirma polpa macia e pronta para consumo",
      },
      {
        trait: "Superficie aveludada",
        how: "Passe os dedos pela casca",
        whatItMeans: "Sensacao levemente cerosa ou pegajosa indica fruto maduro e doce",
      },
    ],
    mango: [
      {
        trait: "Elasticidade da polpa",
        how: "Pressione suavemente a lateral com a palma da mao",
        whatItMeans: "Ceder levemente sob pressao suave confirma polpa doce e macia",
      },
      {
        trait: "Aroma no cabinho",
        how: "Sinta o perfume proximo a insercao do caule",
        whatItMeans: "Aroma frutado e adocicado confirma maturacao completa",
      },
    ],
    pineapple: [
      {
        trait: "Folha central da coroa",
        how: "Puxe suavemente uma folha interna do miolo da coroa",
        whatItMeans: "Se soltar com facilidade sem resistir, o abacaxi esta maduro",
      },
      {
        trait: "Aroma na base",
        how: "Cheire a base inferior do abacaxi",
        whatItMeans: "Perfume doce e agradavel confirma ponto certo: cheiro azedo indica fermentacao",
      },
    ],
    papaya: [
      {
        trait: "Firmeza da casca",
        how: "Pressione levemente a superficie com a ponta dos dedos",
        whatItMeans: "Ceder por igual sem marcas profundas indica polpa cremosa e madura",
      },
    ],
    banana: [
      {
        trait: "Firmeza ao toque",
        how: "Sinta a consistencia segurando na palma da mao",
        whatItMeans: "Firme sem rigidez excessiva indica ponto de consumo confortavel",
      },
    ],
    tomato: [
      {
        trait: "Peso e firmeza",
        how: "Segure na mao e pressione levemente",
        whatItMeans: "Pesado para o tamanho com leve elasticidade garante sabor doce e suculento",
      },
      {
        trait: "Aroma do pendunculo",
        how: "Cheire a regiao onde ficava o cabinho verde",
        whatItMeans: "Aroma fresco e terroso indica tomate colhido no tempo certo",
      },
    ],
    peach: [
      {
        trait: "Maciez no ombro",
        how: "Pressione delicadamente perto da insercao do cabo",
        whatItMeans: "Ceder com suavidade indica polpa aveludada e doce",
      },
      {
        trait: "Perfume floral",
        how: "Sinta o aroma na temperatura ambiente",
        whatItMeans: "Perfume doce e evidente indica maturacao plena",
      },
    ],
    strawberry: [
      {
        trait: "Firmeza volumosa",
        how: "Toque delicadamente na fruta",
        whatItMeans: "Fruto firme por inteiro sem pontos amolecidos ou umidos indica frescor",
      },
      {
        trait: "Aroma perfumado",
        how: "Sinta o aroma dos morangos",
        whatItMeans: "Cheiro adocicado perceptivel a distancia confirma docura natural",
      },
    ],
    apple: [
      {
        trait: "Firmeza solida",
        how: "Pressione com o polegar na lateral",
        whatItMeans: "Casca firme e rigida sem ceder indica crocancia e frescor maximos",
      },
    ],
    orange: [
      {
        trait: "Densidade na mao",
        how: "Compare o peso segurando na palma da mao",
        whatItMeans: "Mais pesada para o tamanho indica abundancia de suco e docura",
      },
    ],
    generic: [
      {
        trait: "Firmeza ao toque",
        how: "Pressione suavemente com a ponta dos dedos",
        whatItMeans: "Ceder de leve sem afundar indica maturacao equilibrada",
      },
      {
        trait: "Aroma natural",
        how: "Sinta o aroma proximo ao cabo ou base",
        whatItMeans: "Frutos no ponto ideal exalam perfume caracteristico fresco e adocicado",
      },
    ],
  },
  "en-GB": {
    watermelon: [
      {
        trait: "Field spot",
        how: "Check the patch where it rested on the ground",
        whatItMeans: "Creamy golden-yellow indicates full ripeness: white or green means underripe",
      },
      {
        trait: "Hollow knock sound",
        how: "Tap the side lightly with your knuckles",
        whatItMeans: "A deep, resonant sound confirms juicy flesh: dull thud means past its prime",
      },
    ],
    avocado: [
      {
        trait: "Gentle thumb press",
        how: "Press gently near the top stem with your thumb",
        whatItMeans: "Yielding slightly without mushiness means ready to eat today or tomorrow",
      },
      {
        trait: "Stem cap check",
        how: "Flick off the small stem nub at top",
        whatItMeans: "Bright green underneath confirms peak readiness: brown means overripe",
      },
    ],
    melon: [
      {
        trait: "Blossom end give",
        how: "Press gently on the end opposite the stem",
        whatItMeans: "A slight springy yield indicates tender, ripe fruit ready to slice",
      },
      {
        trait: "Sweet aroma",
        how: "Sniff the blossom end of the melon",
        whatItMeans: "A rich, floral scent confirms high natural sugar content",
      },
    ],
    cantaloupe: [
      {
        trait: "Blossom end give",
        how: "Press gently on the end opposite the stem",
        whatItMeans: "A slight springy yield indicates tender, ripe fruit ready to slice",
      },
      {
        trait: "Sweet aroma",
        how: "Sniff the blossom end of the melon",
        whatItMeans: "A rich, floral scent confirms high natural sugar content",
      },
    ],
    honeydew: [
      {
        trait: "Blossom end give",
        how: "Press gently on the end opposite the stem",
        whatItMeans: "A slight springy yield indicates tender, ripe fruit ready to slice",
      },
      {
        trait: "Slightly waxy skin",
        how: "Glide your fingers over the rind",
        whatItMeans: "A faintly waxy or sticky feel confirms sweetness and ripeness",
      },
    ],
    mango: [
      {
        trait: "Gentle squeeze",
        how: "Squeeze gently with your palm rather than fingertips",
        whatItMeans: "Slight give indicates ripe, tender flesh inside",
      },
      {
        trait: "Stem fragrance",
        how: "Sniff near the stem attachment point",
        whatItMeans: "A sweet, fruity perfume confirms peak ripeness",
      },
    ],
    pineapple: [
      {
        trait: "Crown leaf pull",
        how: "Tug gently on an inner crown leaf",
        whatItMeans: "Releasing with ease indicates the fruit is fully ripe",
      },
      {
        trait: "Base sweetness",
        how: "Sniff the bottom base of the pineapple",
        whatItMeans: "A sweet pineapple scent confirms peak sweetness: sour scent signals fermentation",
      },
    ],
    papaya: [
      {
        trait: "Peel give",
        how: "Press gently with fingertips across the surface",
        whatItMeans: "Even yielding without soft spots indicates smooth, ready flesh",
      },
    ],
    banana: [
      {
        trait: "Firmness and flex",
        how: "Feel the firmness while holding by the stem",
        whatItMeans: "Gentle give without hollow feel indicates ideal ripeness",
      },
    ],
    tomato: [
      {
        trait: "Firm weight",
        how: "Hold in hand and apply gentle pressure",
        whatItMeans: "Dense weight and slight give ensure rich flavor and juice",
      },
      {
        trait: "Vine aroma",
        how: "Sniff around the green stem area",
        whatItMeans: "A fresh, earthy vine scent confirms vine-ripened flavor",
      },
    ],
    peach: [
      {
        trait: "Shoulder give",
        how: "Press gently near the stem shoulder",
        whatItMeans: "Subtle yielding confirms sweet, velvety flesh",
      },
      {
        trait: "Floral perfume",
        how: "Sniff at room temperature",
        whatItMeans: "Noticeable sweet floral aroma indicates peak readiness",
      },
    ],
    strawberry: [
      {
        trait: "Plump firmness",
        how: "Touch gently across the berries",
        whatItMeans: "Plump and firm without damp spots confirms top freshness",
      },
      {
        trait: "Fragrant scent",
        how: "Sniff the berry punnet",
        whatItMeans: "Sweet aroma carried in the air confirms natural ripeness",
      },
    ],
    apple: [
      {
        trait: "Crisp firmness",
        how: "Press firmly with thumb on the side",
        whatItMeans: "Solid resistance without give indicates crisp, fresh texture",
      },
    ],
    orange: [
      {
        trait: "Density in hand",
        how: "Feel the weight relative to its size",
        whatItMeans: "Heavier weight indicates high juice content and flavor",
      },
    ],
    generic: [
      {
        trait: "Gentle yield",
        how: "Press gently with the pad of your thumb",
        whatItMeans: "A slight give without bruising indicates balanced ripeness",
      },
      {
        trait: "Natural aroma",
        how: "Sniff near the stem or base",
        whatItMeans: "Produce at peak ripeness emits a sweet, fresh fragrance",
      },
    ],
  },
};

/**
 * Resolves produce-specific tactile checks from model response when available,
 * or from the curated catalog fallback. Ensures tactile checks are always available
 * for both comparison and inspect screens.
 */
export function resolveTactileChecks(
  produceTypeOrName?: string | null,
  locale?: string | null,
  modelChecks?: ManualCheck[] | null
): ManualCheck[] {
  if (modelChecks && Array.isArray(modelChecks) && modelChecks.length > 0) {
    return modelChecks;
  }

  const resolvedLocale: "en-GB" | "pt-BR" =
    locale && (locale.startsWith("pt") || locale === "pt-BR") ? "pt-BR" : "en-GB";

  const catalog = TACTILE_CHECKS_CATALOG[resolvedLocale];

  if (!produceTypeOrName) {
    return catalog.generic;
  }

  const slug = normalizeProduceSlug(produceTypeOrName);
  if (slug && catalog[slug]) {
    return catalog[slug];
  }

  // Common aliases
  if (slug === "lemon" || slug === "lime" || slug === "mandarin" || slug === "tangerine" || slug === "clementine") {
    return catalog.orange;
  }
  if (slug === "nectarine" || slug === "apricot" || slug === "plum") {
    return catalog.peach;
  }
  if (slug === "pear") {
    return catalog.apple;
  }

  return catalog.generic;
}
