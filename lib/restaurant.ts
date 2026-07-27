import type { FitnessGoal } from "./types";

export type RestaurantCategory = "all" | "warteg" | "padang" | "ayam" | "bakso_mie" | "soto" | "fast_food" | "cafe";
type MealCategory = Exclude<RestaurantCategory, "all">;

export interface RestaurantMeal {
  id: string;
  name: string;
  aliases: string[];
  category: MealCategory;
  restaurantLabel: string;
  serving: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  fullnessScore: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  note: string;
}

export interface RestaurantRecommendation extends RestaurantMeal {
  fitScore: number;
  budgetDelta: number;
  fitLabel: "pas" | "masih_masuk" | "melewati";
  decision: string;
  confidence: "medium" | "high";
}

export interface RestaurantInput {
  remainingCalories: number;
  remainingProteinG: number;
  goal: FitnessGoal;
  category: RestaurantCategory;
  query: string;
}

export interface RestaurantStrategy {
  message: string;
  recommendations: RestaurantRecommendation[];
  queryMatched: boolean;
  dataNote: string;
}

function meal(
  id: string,
  name: string,
  aliases: string[],
  category: MealCategory,
  restaurantLabel: string,
  serving: string,
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  fiberG: number,
  fullnessScore: 1 | 2 | 3 | 4 | 5,
  tags: string[],
  note: string,
): RestaurantMeal {
  return { id, name, aliases, category, restaurantLabel, serving, calories, proteinG, carbsG, fatG, fiberG, fullnessScore, tags, note };
}

export const RESTAURANT_MEALS: RestaurantMeal[] = [
  meal("warteg-ayam-goreng", "Nasi warteg ayam goreng + sayur", ["nasi ayam goreng", "ayam goreng warteg", "nasi rames ayam"], "warteg", "Warteg", "nasi 180 g, ayam goreng 1 potong, sayur 1 porsi", 650, 31, 70, 26, 5, 4, ["ayam", "goreng", "nasi", "sayur", "gurih"], "Kurangi nasi atau pilih ayam tanpa kulit bila budget kalori sempit."),
  meal("warteg-ikan-kembung", "Nasi warteg ikan kembung + sayur", ["nasi ikan", "ikan kembung warteg", "nasi rames ikan"], "warteg", "Warteg", "nasi 180 g, ikan kembung 1 ekor kecil, sayur 1 porsi", 560, 32, 67, 18, 5, 4, ["ikan", "kembung", "nasi", "sayur", "protein"], "Pilihan protein yang relatif efisien; minyak dan kuah tambahan tetap berpengaruh."),
  meal("warteg-telur-balado", "Nasi warteg telur balado + sayur", ["nasi telur", "telur balado warteg", "nasi rames telur"], "warteg", "Warteg", "nasi 180 g, telur balado 1 butir, sayur 1 porsi", 500, 18, 69, 17, 5, 3, ["telur", "balado", "nasi", "sayur", "pedas"], "Cukup terukur, tetapi proteinnya lebih rendah daripada ayam atau ikan."),
  meal("warteg-tempe-tahu", "Nasi warteg tahu-tempe + sayur", ["nasi tempe tahu", "nasi rames vegetarian", "warteg tanpa daging"], "warteg", "Warteg", "nasi 150 g, tahu 1, tempe 1, sayur 1 porsi", 510, 20, 66, 20, 7, 4, ["tahu", "tempe", "nasi", "sayur", "vegetarian"], "Protein nabati dan seratnya baik; versi goreng menyerap lebih banyak minyak."),
  meal("warteg-gado-gado", "Gado-gado tanpa lontong", ["gado gado", "gado-gado sayur", "pecel sayur"], "warteg", "Warteg / kedai Indonesia", "sayur, tahu-tempe, telur, saus kacang sedang", 470, 23, 35, 28, 9, 5, ["gado-gado", "sayur", "tahu", "tempe", "telur", "kacang"], "Minta saus kacang terpisah agar porsinya mudah dikontrol."),

  meal("padang-rendang", "Nasi Padang rendang", ["nasi rendang", "rendang padang", "nasi padang daging"], "padang", "Rumah makan Padang", "nasi 200 g, rendang 1 potong, sayur nangka, sambal", 760, 30, 79, 35, 5, 4, ["rendang", "daging", "nasi", "padang", "santan"], "Porsi nasi dan banyaknya kuah santan adalah sumber variasi terbesar."),
  meal("padang-ayam-bakar", "Nasi Padang ayam bakar", ["nasi ayam bakar padang", "ayam bakar padang", "nasi padang ayam"], "padang", "Rumah makan Padang", "nasi 200 g, ayam bakar 1 potong, sayur nangka, sambal", 680, 35, 78, 25, 5, 4, ["ayam", "bakar", "nasi", "padang", "protein"], "Biasanya lebih efisien daripada rendang; batasi kuah santan bila perlu."),
  meal("padang-ayam-pop", "Nasi Padang ayam pop", ["nasi ayam pop", "ayam pop padang"], "padang", "Rumah makan Padang", "nasi 200 g, ayam pop 1 potong, sayur, sambal", 640, 34, 77, 21, 4, 4, ["ayam", "ayam pop", "nasi", "padang"], "Cukup tinggi protein; sambal dan kuah tambahan dapat menggeser estimasi."),
  meal("padang-ikan-bakar", "Nasi Padang ikan bakar", ["nasi ikan bakar padang", "ikan bakar padang"], "padang", "Rumah makan Padang", "nasi 180 g, ikan bakar 1 potong, sayur, sambal", 590, 35, 69, 19, 5, 4, ["ikan", "bakar", "nasi", "padang", "protein"], "Salah satu pilihan Padang yang lebih mudah masuk budget bila kuah dibatasi."),
  meal("padang-telur-dadar", "Nasi Padang telur dadar", ["nasi telur dadar padang", "telur dadar padang"], "padang", "Rumah makan Padang", "nasi 200 g, telur dadar Padang 1 potong, sayur, sambal", 700, 22, 80, 32, 5, 3, ["telur", "dadar", "nasi", "padang", "goreng"], "Telur dadar Padang menyerap cukup banyak minyak."),

  meal("ayam-geprek", "Ayam geprek + nasi", ["nasi ayam geprek", "geprek", "ayam sambal"], "ayam", "Ayam geprek", "nasi 180 g, ayam tepung 1 potong, sambal", 720, 34, 76, 31, 3, 4, ["ayam", "geprek", "nasi", "tepung", "pedas", "goreng"], "Ayam tepung, kulit, dan minyak sambal menjadi sumber kalori terbesar."),
  meal("ayam-bakar-nasi", "Ayam bakar + nasi + lalapan", ["nasi ayam bakar", "ayam bakar lalapan"], "ayam", "Kedai ayam", "nasi 180 g, ayam bakar 1 potong, lalapan, sambal", 570, 36, 68, 17, 4, 4, ["ayam", "bakar", "nasi", "lalapan", "protein"], "Pilihan protein efisien; kurangi kulit dan kecap berlebih bila perlu."),
  meal("pecel-ayam", "Pecel ayam + nasi", ["nasi pecel ayam", "ayam goreng lalapan", "ayam penyet"], "ayam", "Pecel ayam / ayam penyet", "nasi 180 g, ayam goreng 1 potong, lalapan, sambal", 680, 34, 70, 28, 4, 4, ["ayam", "goreng", "nasi", "lalapan", "sambal"], "Setengah nasi atau ayam tanpa kulit menghemat kalori tanpa kompensasi ekstrem."),
  meal("chicken-katsu-rice", "Chicken katsu rice", ["nasi katsu", "katsu ayam", "chicken katsu"], "ayam", "Kedai Jepang / rice bowl", "nasi 180 g, chicken katsu 1 potong, saus", 750, 35, 86, 29, 3, 4, ["ayam", "katsu", "nasi", "tepung", "goreng"], "Tepung, minyak, dan saus membuatnya lebih tinggi kalori daripada ayam panggang."),

  meal("bakso-kuah", "Bakso kuah tanpa mi", ["bakso", "bakso kuah", "bakso polos"], "bakso_mie", "Kedai bakso", "5 bakso sedang, tahu, sayur, kuah", 390, 27, 31, 17, 3, 4, ["bakso", "kuah", "daging", "tanpa mi"], "Tanpa mi lebih mudah masuk budget; gorengan dan saus dihitung terpisah."),
  meal("bakso-mie", "Bakso lengkap dengan mi", ["bakso mie", "bakso bihun", "bakso lengkap"], "bakso_mie", "Kedai bakso", "5 bakso sedang, mi/bihun, tahu, sayur, kuah", 570, 29, 68, 20, 4, 4, ["bakso", "mi", "bihun", "kuah", "daging"], "Porsi mi adalah pembeda utama dibanding bakso kuah tanpa mi."),
  meal("mie-ayam", "Mi ayam", ["mie ayam", "bakmi ayam", "mi ayam biasa"], "bakso_mie", "Kedai mi ayam", "1 mangkuk mi, topping ayam, sayur", 520, 24, 70, 17, 4, 3, ["mi", "mie", "ayam", "bakmi", "kuah"], "Minyak ayam dan ukuran mi berbeda antarkedai; pangsit dihitung terpisah."),
  meal("mie-ayam-bakso", "Mi ayam bakso", ["mie ayam bakso", "mi ayam bakso", "bakmi bakso"], "bakso_mie", "Kedai mi ayam", "1 mangkuk mi ayam + 2 bakso", 650, 32, 76, 24, 4, 4, ["mi", "mie", "ayam", "bakso", "bakmi"], "Protein naik dibanding mi ayam biasa, tetapi kalorinya juga meningkat."),

  meal("soto-ayam-nasi", "Soto ayam + nasi", ["nasi soto ayam", "soto ayam", "soto bening"], "soto", "Kedai soto", "1 mangkuk soto ayam + nasi 150 g", 480, 29, 61, 14, 3, 4, ["soto", "ayam", "nasi", "kuah", "bening"], "Kuah bening dan nasi terukur relatif mudah disesuaikan."),
  meal("soto-betawi-nasi", "Soto Betawi + nasi", ["nasi soto betawi", "soto santan", "soto daging"], "soto", "Kedai soto Betawi", "1 mangkuk soto daging bersantan + nasi 150 g", 720, 31, 61, 38, 3, 4, ["soto", "betawi", "daging", "santan", "nasi"], "Santan dan bagian daging berlemak membuat variasi kalori cukup besar."),
  meal("rawon-nasi", "Rawon + nasi", ["nasi rawon", "rawon daging"], "soto", "Kedai rawon", "1 mangkuk rawon daging + nasi 150 g", 590, 31, 59, 24, 3, 4, ["rawon", "daging", "nasi", "kuah"], "Telur asin, kerupuk, dan gorengan perlu ditambahkan terpisah."),

  meal("fastfood-fried-chicken", "Ayam goreng cepat saji + nasi", ["fried chicken nasi", "ayam kentucky nasi", "ayam crispy nasi"], "fast_food", "Fast food", "ayam crispy 1 potong + nasi 1 porsi", 620, 30, 67, 25, 2, 3, ["ayam", "fried chicken", "nasi", "crispy", "fast food"], "Minuman manis, saus, dan side dish belum termasuk."),
  meal("fastfood-burger-fries", "Burger sapi + kentang kecil", ["burger kentang", "burger fries", "paket burger"], "fast_food", "Fast food", "1 burger reguler + kentang goreng kecil", 760, 28, 84, 35, 6, 3, ["burger", "kentang", "fries", "fast food", "daging"], "Minuman nol kalori mencegah paket bertambah sekitar satu minuman manis."),
  meal("fastfood-grilled-chicken", "Grilled chicken rice", ["ayam panggang nasi", "grilled chicken", "chicken rice"], "fast_food", "Fast food / rice bowl", "ayam panggang 120 g, nasi 150 g, sayur", 490, 38, 57, 12, 4, 4, ["ayam", "panggang", "grilled", "nasi", "protein"], "Saus creamy dapat menaikkan kalori; gunakan sebagian atau pilih saus ringan."),

  meal("cafe-chicken-rice-bowl", "Chicken rice bowl", ["rice bowl ayam", "nasi ayam cafe", "chicken bowl"], "cafe", "Kafe / rice bowl", "nasi 150 g, ayam 120 g, sayur, saus", 540, 37, 62, 17, 5, 4, ["ayam", "rice bowl", "nasi", "cafe", "protein"], "Minta saus terpisah bila komposisinya tidak jelas."),
  meal("cafe-chicken-sandwich", "Chicken sandwich", ["sandwich ayam", "roti ayam", "chicken toast"], "cafe", "Kafe", "2 lembar roti, ayam, sayur, saus", 460, 31, 48, 17, 6, 4, ["ayam", "sandwich", "roti", "cafe", "quick"], "Mayones dan keju adalah sumber variasi terbesar."),
  meal("cafe-chicken-salad", "Chicken salad", ["salad ayam", "grilled chicken salad", "salad protein"], "cafe", "Kafe", "ayam 120 g, sayuran besar, dressing sedang", 360, 36, 18, 17, 8, 5, ["ayam", "salad", "sayur", "cafe", "protein", "ringan"], "Gunakan sebagian dressing agar keunggulan kalorinya tetap terjaga."),
  meal("cafe-aglio-olio-chicken", "Spaghetti aglio olio ayam", ["pasta ayam", "aglio olio", "spaghetti chicken"], "cafe", "Kafe", "1 piring pasta + ayam", 690, 32, 82, 26, 5, 4, ["pasta", "spaghetti", "ayam", "aglio olio", "cafe"], "Jumlah minyak yang digunakan dapat mengubah estimasi cukup besar."),
];

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function queryScore(item: RestaurantMeal, query: string): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  const searchable = normalize([item.name, item.restaurantLabel, ...item.aliases, ...item.tags].join(" "));
  let score = searchable.includes(normalizedQuery) ? 8 : 0;
  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  const searchableTokens = new Set(searchable.split(" ").filter(Boolean));
  const matchedTokens = tokens.filter((token) => searchableTokens.has(token));
  const minimumMatches = tokens.length <= 1 ? 1 : Math.ceil(tokens.length * 0.6);
  if (matchedTokens.length < minimumMatches) return 0;
  return score + matchedTokens.length * 2;
}

function decisionFor(item: RestaurantMeal, remainingCalories: number): Pick<RestaurantRecommendation, "fitLabel" | "decision"> {
  const delta = item.calories - remainingCalories;
  if (delta <= 0) return { fitLabel: "pas", decision: `Masih menyisakan sekitar ${Math.abs(delta)} kcal dari budget hari ini.` };
  if (delta <= 150) return { fitLabel: "masih_masuk", decision: `Sedikit di atas sisa budget (${delta} kcal); kurangi nasi atau saus.` };
  return { fitLabel: "melewati", decision: `Melewati sisa budget sekitar ${delta} kcal. Pilih porsi lebih kecil atau menu alternatif.` };
}

export function buildRestaurantStrategy(input: RestaurantInput): RestaurantStrategy {
  const remainingCalories = Math.max(0, Math.round(input.remainingCalories));
  const remainingProteinG = Math.max(0, Math.round(input.remainingProteinG));
  const normalizedQuery = normalize(input.query);
  const categoryMeals = RESTAURANT_MEALS.filter((item) => input.category === "all" || item.category === input.category);
  const matchedMeals = normalizedQuery ? categoryMeals.filter((item) => queryScore(item, normalizedQuery) > 0) : categoryMeals;

  const recommendations = matchedMeals.map((item) => {
    const budgetDelta = item.calories - remainingCalories;
    let fitScore = queryScore(item, normalizedQuery);
    fitScore += budgetDelta <= 0 ? 6 : budgetDelta <= 100 ? 3 : budgetDelta <= 200 ? 1 : -Math.min(6, budgetDelta / 100);
    fitScore += Math.min(4, item.proteinG / 10) + item.fullnessScore * 0.6;
    if (remainingProteinG > 0 && item.proteinG >= Math.min(35, remainingProteinG)) fitScore += 2;
    if ((input.goal === "weight_loss" || input.goal === "very_lean") && item.calories <= 550) fitScore += 2;
    if (input.goal === "athletic" && item.carbsG >= 45 && item.proteinG >= 25) fitScore += 1.5;
    if (input.goal === "muscle_gain" && item.proteinG >= 32) fitScore += 2;
    return {
      ...item,
      ...decisionFor(item, remainingCalories),
      budgetDelta,
      fitScore: Math.round(fitScore * 10) / 10,
      confidence: item.aliases.some((alias) => normalize(alias) === normalizedQuery) || normalize(item.name) === normalizedQuery ? "high" as const : "medium" as const,
    };
  }).sort((a, b) => b.fitScore - a.fitScore || a.calories - b.calories).slice(0, 8);

  const queryMatched = recommendations.length > 0;
  const message = normalizedQuery && !queryMatched
    ? "Menu belum ada di library lokal. Coba kata yang lebih umum: ayam geprek, nasi Padang, bakso, mi ayam, atau soto."
    : remainingCalories <= 0
      ? "Budget hari ini sudah habis. Hasil tetap ditampilkan agar keputusan tidak berubah menjadi kompensasi ekstrem besok."
      : `Pilihan diurutkan berdasarkan kecocokan menu, sisa ${remainingCalories} kcal, kebutuhan protein, rasa kenyang, dan goal aktifmu.`;

  return {
    message,
    recommendations,
    queryMatched,
    dataNote: "Nilai gizi adalah estimasi porsi restoran Indonesia. Minyak, santan, saus, ukuran nasi, dan resep tiap tempat dapat mengubah hasil; koreksi porsi sebelum menyimpan.",
  };
}
