// 英単語3000（words3000-data.js）の各例文（ex.en）に、単語ごとの意味を
// 「word(意味) word(意味)」形式で付けた ex.gloss を機械生成し、ファイルを上書きする
// メンテナンス用スクリプト（アプリ本体からは読み込まない。手動で `node tools/gen-words3000-gloss.js`
// を実行した時だけ動く）。WORDS3000自身の{word: ja}辞書 + 規則活用のパターンマッチ
// （複数形・三人称単数・-ing・-ed・比較級など）+ 代名詞の変化形/縮約形/不規則動詞などの
// 補助辞書(EXTRA)で構成される簡易lemmatizerで各トークンの意味を引く。
//
// WORDS3000にrank/word/pos/kana/ja/exを追加・編集したら、このスクリプトを再実行して
// glossを再生成すること（差分レビューしやすいよう、既存のglossは全件このスクリプトの
// 出力で置き換わる＝手で書いたglossがあっても上書きされるので注意）。
//
// カバレッジは意図的に100%を狙っていない。WORDS3000本体+補助辞書でカバーしきれない
// 低頻度語（3000語の例文全体で1〜2回しか出現しない単語）は、意味を付けずそのまま表示する
// （2026-09-16時点でカバレッジ約97%）。
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'words3000-data.js');

let code = fs.readFileSync(SRC, 'utf8').replace('const WORDS3000 =', 'global.WORDS3000 =');
eval(code);

const dict = {};
WORDS3000.forEach(w => { dict[w.word.toLowerCase()] = w.ja; });

const EXTRA = {
  "i": "私は", "me": "私を", "mine": "私のもの", "yours": "あなたのもの",
  "her": "彼女の／を", "hers": "彼女のもの", "them": "彼らを", "theirs": "彼らのもの",
  "am": "＝である", "'m": "＝である",
  "it's": "それは〜です", "that's": "それは〜です", "there's": "〜があります",
  "what's": "〜は何ですか", "let's": "〜しましょう", "here's": "ここに〜があります",
  "don't": "〜しない", "doesn't": "〜しない", "didn't": "〜しなかった",
  "isn't": "〜ではない", "aren't": "〜ではない", "wasn't": "〜ではなかった", "weren't": "〜ではなかった",
  "can't": "〜できない", "won't": "〜しないだろう", "wouldn't": "〜しないだろう",
  "couldn't": "〜できなかった", "shouldn't": "〜すべきではない",
  "i'm": "私は〜です", "i'll": "私は〜するつもりです", "i'd": "私は〜したい／だった",
  "i've": "私は〜した", "you're": "あなたは〜です", "you'll": "あなたは〜するでしょう",
  "you'd": "あなたは〜したい", "you've": "あなたは〜した",
  "we're": "私たちは〜です", "we'll": "私たちは〜するでしょう", "we've": "私たちは〜した",
  "they're": "彼らは〜です", "they'll": "彼らは〜するでしょう", "they've": "彼らは〜した",
  "he's": "彼は〜です", "she's": "彼女は〜です",
  "'ve": "〜した（完了）", "'ll": "〜するだろう", "'re": "〜です", "'d": "〜したい／だった",
  "was": "＝だった", "were": "＝だった",
  "has": "持っている", "had": "持っていた", "having": "持っている",
  "does": "する", "did": "した", "done": "した（完了）", "doing": "している",
  "goes": "行く", "went": "行った", "gone": "行ってしまった", "going": "行っている",
  "gets": "手に入れる", "got": "手に入れた", "gotten": "手に入れた", "getting": "手に入れている",
  "makes": "作る", "made": "作った", "making": "作っている",
  "takes": "取る", "took": "取った", "taken": "取った（完了）", "taking": "取っている",
  "comes": "来る", "came": "来た", "coming": "来ている",
  "sees": "見る", "saw": "見た", "seen": "見た（完了）", "seeing": "見ている",
  "knows": "知っている", "knew": "知っていた", "known": "知られている", "knowing": "知っている",
  "thinks": "思う", "thought": "思った",
  "says": "言う", "said": "言った", "saying": "言っている",
  "gives": "与える", "gave": "与えた", "given": "与えられた", "giving": "与えている",
  "finds": "見つける", "found": "見つけた", "finding": "見つけている",
  "tells": "伝える", "told": "伝えた", "telling": "伝えている",
  "becomes": "〜になる", "became": "〜になった",
  "leaves": "去る／残す", "left": "去った／残した", "leaving": "去っている",
  "feels": "感じる", "felt": "感じた", "feeling": "感じている",
  "keeps": "保つ", "kept": "保った", "keeping": "保っている",
  "lets": "させる",
  "puts": "置く", "putting": "置いている",
  "runs": "走る", "ran": "走った", "running": "走っている",
  "wants": "欲しい", "wanted": "欲しかった", "wanting": "欲している",
  "needs": "必要とする", "needed": "必要だった", "needing": "必要としている",
  "uses": "使う", "used": "使った", "using": "使っている",
  "tries": "試す", "tried": "試した", "trying": "試している",
  "asks": "尋ねる", "asked": "尋ねた", "asking": "尋ねている",
  "works": "働く／機能する", "worked": "働いた", "working": "働いている",
  "calls": "呼ぶ", "called": "呼んだ", "calling": "呼んでいる",
  "looks": "見える", "looked": "見た", "looking": "見ている",
  "seems": "〜のようだ", "seemed": "〜のようだった",
  "helps": "助ける", "helped": "助けた", "helping": "助けている",
  "shows": "見せる", "showed": "見せた", "shown": "見せられた", "showing": "見せている",
  "hears": "聞こえる", "heard": "聞こえた", "hearing": "聞いている",
  "plays": "遊ぶ／演奏する", "played": "遊んだ", "playing": "遊んでいる",
  "moves": "動く", "moved": "動いた", "moving": "動いている",
  "lives": "住む", "lived": "住んだ", "living": "住んでいる",
  "believes": "信じる", "believed": "信じた",
  "brings": "持ってくる", "brought": "持ってきた", "bringing": "持ってきている",
  "happens": "起こる", "happened": "起こった", "happening": "起こっている",
  "writes": "書く", "wrote": "書いた", "written": "書かれた", "writing": "書いている",
  "provides": "提供する", "provided": "提供した",
  "sits": "座る", "sat": "座った", "sitting": "座っている",
  "stands": "立つ", "stood": "立った", "standing": "立っている",
  "loses": "失う", "lost": "失った", "losing": "失っている",
  "pays": "払う", "paid": "払った", "paying": "払っている",
  "meets": "会う", "met": "会った", "meeting": "会っている",
  "includes": "含む", "included": "含んだ", "including": "含んでいる",
  "continues": "続ける", "continued": "続けた",
  "sets": "設定する", "setting": "設定している",
  "learns": "学ぶ", "learned": "学んだ", "learning": "学んでいる",
  "changes": "変わる", "changed": "変わった", "changing": "変わっている",
  "leads": "導く", "led": "導いた",
  "understands": "理解する", "understood": "理解した",
  "watches": "見る", "watched": "見た", "watching": "見ている",
  "follows": "従う", "followed": "従った", "following": "従っている",
  "stops": "止まる", "stopped": "止まった", "stopping": "止まっている",
  "creates": "作り出す", "created": "作り出した",
  "speaks": "話す", "spoke": "話した", "spoken": "話された", "speaking": "話している",
  "reads": "読む",
  "allows": "許す", "allowed": "許した",
  "adds": "加える", "added": "加えた", "adding": "加えている",
  "spends": "費やす", "spent": "費やした", "spending": "費やしている",
  "grows": "育つ", "grew": "育った", "grown": "育った（完了）", "growing": "育っている",
  "opens": "開く", "opened": "開いた", "opening": "開いている",
  "walks": "歩く", "walked": "歩いた", "walking": "歩いている",
  "wins": "勝つ", "won": "勝った", "winning": "勝っている",
  "offers": "提供する", "offered": "提供した",
  "remembers": "覚えている", "remembered": "覚えていた",
  "loves": "愛する", "loved": "愛した",
  "considers": "考える", "considered": "考えた",
  "appears": "現れる", "appeared": "現れた",
  "buys": "買う", "bought": "買った", "buying": "買っている",
  "waits": "待つ", "waited": "待った", "waiting": "待っている",
  "serves": "提供する", "served": "提供した", "serving": "提供している",
  "dies": "死ぬ", "died": "死んだ",
  "sends": "送る", "sent": "送った", "sending": "送っている",
  "expects": "期待する", "expected": "期待した",
  "builds": "建てる", "built": "建てた",
  "stays": "滞在する", "stayed": "滞在した", "staying": "滞在している",
  "falls": "落ちる", "fell": "落ちた", "fallen": "落ちた（完了）",
  "cuts": "切る", "cutting": "切っている",
  "reaches": "着く", "reached": "着いた",
  "kills": "殺す", "killed": "殺した",
  "remains": "残る", "remained": "残った",
  "eats": "食べる", "ate": "食べた", "eaten": "食べた（完了）", "eating": "食べている",
  "drinks": "飲む", "drank": "飲んだ", "drunk": "飲んだ（完了）", "drinking": "飲んでいる",
  "sells": "売る", "sold": "売った", "selling": "売っている",
  "drives": "運転する", "drove": "運転した", "driving": "運転している",
  "rides": "乗る", "rode": "乗った", "riding": "乗っている",
  "flies": "飛ぶ", "flew": "飛んだ", "flown": "飛んだ（完了）", "flying": "飛んでいる",
  "borrows": "借りる", "borrowed": "借りた", "borrowing": "借りている",
  "visits": "訪れる", "visited": "訪れた", "visiting": "訪れている",
  "checks": "確認する", "checked": "確認した", "checking": "確認している",
  "enjoys": "楽しむ", "enjoyed": "楽しんだ", "enjoying": "楽しんでいる",
  "travels": "旅する", "traveled": "旅した", "traveling": "旅している",
  "sounds": "聞こえる", "sounded": "聞こえた",
  "smells": "匂いがする", "smelled": "匂いがした",
  "tastes": "味がする", "tasted": "味がした",
  "fits": "合う", "fitted": "合った", "fitting": "合っている",
  "starts": "始まる", "started": "始まった", "starting": "始まっている",
  "ends": "終わる", "ended": "終わった",
  "closes": "閉まる", "closed": "閉まった", "closing": "閉まっている",
  "arrives": "到着する", "arrived": "到着した",
  "returns": "戻る", "returned": "戻った",
  "rains": "雨が降る", "rained": "雨が降った", "raining": "雨が降っている",
  "get": "手に入れる", "go": "行く", "make": "作る", "keep": "保つ", "bring": "持ってくる",
  "let": "させる", "send": "送る", "hear": "聞こえる", "live": "住む", "ride": "乗る",
  "forget": "忘れる", "forgot": "忘れた", "forgotten": "忘れた（完了）",
  "cook": "料理する", "cooked": "料理した", "cooking": "料理している",
  "recommend": "勧める", "recommended": "勧めた", "recommends": "勧める",
  "about": "〜について", "small": "小さい", "like": "〜のような／好む", "dish": "料理",
  "bit": "少し", "tour": "ツアー", "tonight": "今夜", "great": "素晴らしい",
  "cafe": "カフェ", "region": "地域", "nice": "良い", "whole": "全体の",
  "road": "道", "many": "たくさんの", "staff": "スタッフ", "garden": "庭",
  "more": "もっと", "quite": "かなり", "careful": "注意深い", "along": "〜に沿って",
  "travel": "旅行する", "where": "どこ", "where's": "どこに〜がありますか",
  "app": "アプリ", "borrow": "借りる", "boat": "ボート", "real": "本物の",
  "english": "英語", "really": "本当に", "which": "どちら", "while": "〜する間",
  "everyone": "みんな", "entrance": "入口", "during": "〜の間", "best": "最高の",
  "pool": "プール", "once": "一度", "home": "家", "friendly": "親しみやすい",
  "castle": "城", "sorry": "すみません", "main": "主な", "quickly": "すぐに",
  "few": "少しの", "ago": "〜前に", "perfect": "完璧な", "tourism": "観光",
  "comfortable": "快適な", "top": "頂上", "such": "そのような", "extra": "追加の",
  "fun": "楽しい", "tower": "塔", "someone": "誰か", "another": "もう一つの",
  "afternoon": "午後", "due": "〜のため", "until": "〜まで", "locally": "地元で",
  "each": "それぞれ", "excellent": "素晴らしい", "everything": "すべて",
  "available": "利用できる", "without": "〜なしで",
  "just": "ちょうど／ただ", "been": "＝だった（過去分詞）", "should": "〜すべきだ",
  "cut": "切る", "form": "形", "wall": "壁", "rich": "裕福な", "daily": "毎日の",
  "mostly": "主に", "huge": "巨大な", "children": "子供たち", "desk": "机",
  "enough": "十分な", "card": "カード", "might": "〜かもしれない", "sudden": "突然の",
  "ahead": "前方に", "low": "低い", "hall": "ホール", "off": "離れて",
  "almost": "ほとんど", "later": "後で", "bloom": "咲く", "bad": "悪い",
  "quick": "速い", "shrine": "神社", "artist": "芸術家", "farm": "農場",
  "heat": "熱", "activity": "活動", "honors": "称える", "giant": "巨大な",
  "large": "大きい", "wore": "身につけていた", "somewhere": "どこかに",
  "wake": "目覚める", "within": "〜以内に", "say": "言う", "instead": "代わりに",
  "downtown": "繁華街", "drive": "運転する", "stunning": "見事な", "edge": "端",
  "ever": "これまでに", "play": "遊ぶ", "ruins": "遺跡", "sense": "感覚",
  "both": "両方", "roof": "屋根", "online": "オンラインで", "wild": "野生の",
  "incredibly": "信じられないほど", "fried": "揚げた", "lit": "明かりが灯った",
  "entirely": "完全に", "natural": "自然の", "wooden": "木製の", "rest": "残り",
  "dollars": "ドル", "ocean": "海", "better": "より良い", "quietly": "静かに",
  "excuse": "許してください", "soon": "すぐに", "clock": "時計", "minor": "小さな",
  "sunscreen": "日焼け止め", "ready": "準備ができた", "bike": "自転車",
  "under": "〜の下に", "short": "短い", "event": "行事", "broke": "壊れた",
  "broken": "壊れた（完了）", "hill": "丘", "film": "映画", "photography": "写真撮影",
  "translation": "翻訳", "kids'": "子供たちの",
  "wet": "濡れた", "add": "加える", "site": "現場", "hostel": "ホステル",
  "itinerary": "旅程", "resort": "リゾート", "fine": "元気な／罰金", "hidden": "隠れた",
  "overnight": "一晩の", "steep": "急な", "everywhere": "どこでも", "luck": "運",
  "performers": "演者", "alley": "路地", "pretty": "かなり／かわいい", "those": "それらの",
  "tall": "背が高い", "caught": "捕まえた", "bottle": "ボトル", "held": "開催した",
  "section": "区画", "tv": "テレビ", "several": "いくつかの", "press": "押す",
  "cozy": "居心地の良い", "major": "主要な", "national": "国立の", "final": "最後の",
  "loose": "ゆるい", "cute": "かわいい", "center": "中心", "ruin": "遺跡",
  "historic": "歴史的な", "handwoven": "手織りの", "performed": "演じた",
};

function lookup(w){ return dict[w] || EXTRA[w] || null; }

// 名詞の複数形・動詞の三人称単数/過去形/現在分詞・比較級/最上級など、規則変化を
// dict/EXTRAへの辞書引きへ還元する簡易語形変換。不規則形はEXTRAに直接列挙してある。
function lemmatize(lower){
  const direct = lookup(lower);
  if(direct) return direct;
  if(lower.endsWith("'s") && lower.length > 2){
    const m = lookup(lower.slice(0, -2));
    if(m) return m + "の";
  }
  if(lower.endsWith("ied") && lower.length > 4){
    const m = lookup(lower.slice(0, -3) + "y");
    if(m) return m;
  }
  if(lower.endsWith("ies") && lower.length > 4){
    const m = lookup(lower.slice(0, -3) + "y");
    if(m) return m;
  }
  if(lower.endsWith("es") && lower.length > 3){
    const m = lookup(lower.slice(0, -2));
    if(m) return m;
  }
  if(lower.endsWith("s") && lower.length > 2){
    const m = lookup(lower.slice(0, -1));
    if(m) return m;
  }
  if(lower.endsWith("ing") && lower.length > 4){
    let base = lower.slice(0, -3);
    let m = lookup(base);
    if(m) return m;
    m = lookup(base + "e");
    if(m) return m;
    if(base.length > 1 && base[base.length-1] === base[base.length-2]){
      m = lookup(base.slice(0, -1));
      if(m) return m;
    }
  }
  if(lower.endsWith("ed") && lower.length > 3){
    let base = lower.slice(0, -2);
    let m = lookup(base);
    if(m) return m;
    m = lookup(base + "e");
    if(m) return m;
    if(base.length > 1 && base[base.length-1] === base[base.length-2]){
      m = lookup(base.slice(0, -1));
      if(m) return m;
    }
  }
  if(lower.endsWith("er") && lower.length > 3){
    const m = lookup(lower.slice(0,-2));
    if(m) return m;
  }
  if(lower.endsWith("est") && lower.length > 4){
    const m = lookup(lower.slice(0,-3));
    if(m) return m;
  }
  return null;
}

function buildGloss(sentence){
  const parts = sentence.match(/[A-Za-z']+|[^A-Za-z']+/g) || [];
  return parts.map(part => {
    if(!/[A-Za-z]/.test(part)) return part; // 区切り文字・記号はそのまま
    const meaning = lemmatize(part.toLowerCase());
    return meaning ? `${part}(${meaning})` : part;
  }).join('');
}

let totalTokens=0, matched=0;
WORDS3000.forEach(w=>{
  const tokens = w.ex.en.match(/[A-Za-z']+/g) || [];
  tokens.forEach(t=>{ totalTokens++; if(lemmatize(t.toLowerCase())) matched++; });
});
console.log('coverage:', (matched/totalTokens*100).toFixed(1)+'%', `(${matched}/${totalTokens} tokens)`);

const entries = WORDS3000.map(w=>{
  const gloss = buildGloss(w.ex.en);
  return `{rank:${w.rank},word:${JSON.stringify(w.word)},pos:${JSON.stringify(w.pos)},kana:${JSON.stringify(w.kana)},ja:${JSON.stringify(w.ja)},ex:{en:${JSON.stringify(w.ex.en)},kana:${JSON.stringify(w.ex.kana)},ja:${JSON.stringify(w.ex.ja)},gloss:${JSON.stringify(gloss)}}}`;
});

const header = `// 英単語3000（独立ページ words3000.html）で使うデータ。日常会話の9割をカバーすると言われる頻出英単語を、
// 使用頻度順（rank）に収録する。1件＝{rank, word, pos, kana, ja, ex:{en,kana,ja,gloss}}。exのglossは
// 例文中の単語ごとの意味を「word(意味) word(意味)」の形式で示す簡易対訳（フレーズ帳本体のgloss機能と
// 同じ表示形式）。WORDS3000自身の語義辞書＋規則活用のパターンマッチ＋不規則動詞・縮約形などの補助辞書で
// tools/gen-words3000-gloss.jsが機械的に生成する（データを追加・編集したら再実行してglossを更新すること）。
// 辞書でカバーしきれない一部の低頻度語（3000語の例文全体で数回しか出現しない単語）は意味を付けず
// そのまま表示する（カバレッジ約97%）。
// 特定の市販単語帳（Oxford 3000等）をそのまま複製すると著作権上の問題があるため、一般的な頻度の
// 知見をもとに独自に選定している。2026-09-15に全3000語（10バッチ）を収録完了。
// words3000.htmlから<script src="words3000-data.js">で読み込む（no-build単一HTMLの方針は維持しつつ、
// 500KB超のこの配列だけは別ファイルに分離）。index.html（フレーズ帳本体）はこのファイルを読み込まない。
const WORDS3000 = [
`;

const out = header + entries.join(',\n') + ',\n];\n';
fs.writeFileSync(SRC, out);
console.log('wrote', entries.length, 'entries,', out.length, 'bytes ->', SRC);
