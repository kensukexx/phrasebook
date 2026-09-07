# ツウジル（旧名：ことばの旅券）

日本語→13言語対応の旅行フレーズブックPWA。個人開発・個人利用が前提。
`index.html` 1ファイルで完結する静的サイトで、ビルドステップは無い。GitHub Pagesで配信。

このファイルは、新しいセッションが毎回コードを読み直さなくても現状を把握できるようにするための
「現状の仕様」と「作業上の注意点」のまとめ。仕様や規約を変更した場合はこのファイルも更新すること。

## 現状の仕様（2026-08-12時点）

- **収録フレーズ**: 309件。1フレーズ＝日本語＋17カテゴリのいずれか＋13言語分の[発音表記, カタカナ読み]＋単語ごとの意味対応(gloss)＋解説(note)。309件全件に13言語分のgloss・解説がある（`tests/data-integrity.test.js`で検証、LANGSは同ファイル内に別途ハードコードされているため、言語を追加したらそちらの配列も更新すること）。フレーズを追加したら`tests/sync.spec.js`の`phraseOrder.length`ハードコード値も更新すること（2026-09-01、「これください」追加時に一度これを見落として気づいた）。
- **対応言語（13）**: 英・韓・独・ルーマニア・西・仏・越・中・葡・露・ヒンディー・タイ・インドネシア。各言語は音声ロケール・紐づく通貨（緊急番号は国）を持つ。ヒンディー語のhi/ローマ字化はGoogle翻訳の非公式エンドポイントで機械翻訳した上で、既知の誤訳（方向を表す語の取り違え等）を手作業で修正し、カタカナ読みは音写ルールで機械生成後にレビューして追加した（詳細はgitログ参照）。タイ語（th、2026-08-13追加、12番目の言語）も同じくGoogle翻訳の下訳を叩き台に、レストラン・空港などの定番表現は自然なタイ語表現へ手作業で修正し（例：乾杯→ไชโย(万歳)ではなくชนแก้ว(グラスを合わせる)、鍵→สำคัญ(重要)ではなくกุญแจ(鍵)、寒い/冷たいが両方เย็นに誤訳されていたのをหนาว/เย็นに分離、など）、gloss（単語対応）は他言語と同じくタイ文字表記で統一（ローマ字のまま出した初稿を、416種の語彙をローマ字→タイ文字辞書に変換して機械的に修正）。緊急番号は警察191・救急1669・消防199。
- **インドネシア語（2026-09-08追加、13番目の言語）**: Google翻訳の下訳を叩き台に、レストラン・ホテル・買い物などの定番表現を自然な口語インドネシア語へ手作業で修正（例：お会計→Tolong periksa「検査して」ではなくMinta bon「伝票をください」、チェックイン/アウト→Silakan check-in「どうぞ」ではなくSaya mau check-in「したいです」という向きの逆転を修正、それを冷やして→biarkan dingin「冷めるまで放置」ではなくTolong dinginkan itu「冷やしてください」、数字は桁の生成規則（satu〜sepuluh→sebelas〜sembilan belas→dua puluh）で機械生成）。カジュアルな一人称aku/二人称kamuが混在していた下訳は、旅行者が使う想定でsaya/Andaに統一。**重要な落とし穴**: 言語キーに素直にISO 639-1コードの"id"を使うと、フレーズの識別子として全データ構造で使われている既存の`.id`プロパティ（`keyOf(d){ return d.id || d.ja; }`、customData/学習ラウンジ/CHANGELOGのid生成など）と衝突し、`keyOf()`が本来の日本語キーの代わりに配列`["Halo","ハロ"]`を返すようになって`data-key`属性が"Halo,ハロ"という文字列になる、というサイレントな破壊的バグを引き起こした（テストの`applyCloudState`並び替えテストで発覚）。ISO 639-2/3の"ind"に変更して回避した。**今後もし言語を追加する時は、そのkeyが"id"（または将来的に他の予約語）と衝突しないか必ず確認すること。**緊急番号は警察110・救急118・消防113。
- **カテゴリ（組み込み17＋ユーザーが自由に追加可能）**: 基本ワード・あいさつ・リアクション・食事・移動・ホテル・買い物観光・自己紹介・気持ち・数字・時間・緊急・豆知識・その他、および検索欄上のスイッチで切り替える会話パターン系3種（接続詞で文をつなぐ練習用）。カテゴリタブ・フレーズカードは長押しドラッグで並び替え可能。フレーズ追加パネルのカテゴリ選択欄の「＋」から独自カテゴリ（`customCats`、`phrasebook-custom-cats`に保存、同期対象）を作成でき、🗑で削除も可能（削除時はそのカテゴリのフレーズを`customData`側だけ「その他」に自動移動。組み込みフレーズが独自カテゴリに入ることはないので影響なし）。
- **カテゴリバーの表示**: 既定は1行の横スクロール。設定画面の「カテゴリバー」トグル（`catBarWrap`、端末ローカルのみ・同期対象外）で2行表示に切り替えられる。最初はCSSの`flex-wrap`で無制限に折り返す実装だったが、カテゴリ数が多いとスマホで画面の半分近くを占領してしまうと分かり、`display:grid; grid-auto-flow:column; grid-template-rows:repeat(2, auto)`で常に2行に固定し、はみ出た分は（1行表示の時と同じく）横スクロールする形に直した。長押しドラッグの並び替えは、指のY座標と同じ行の候補だけに絞ってからX座標で比較する（`attachCatDrag`内の`catBarWrap`分岐、`getBoundingClientRect()`ベースなのでflex/grid問わず機能する）。
- **固定ヘッダー範囲**（2026-09-01拡張）: カテゴリタブ（`.cats`）だけでなく、その下の▶聞き流し・速度・📌・✓・進捗の行（`.filterbar`）もスクロール中ずっと見えるようにしてほしい、という要望を受け、両方を`.sticky-controls`（`position:sticky; top:0`）でまとめて包んだ。個別に`position:sticky`を付けると`.filterbar`側の`top`をJSで`.cats`の高さ分オフセットする必要が出るところを、共通の親に1つだけstickyを付けることで高さ計算なしで両方が一体で追従する形にした（`.cats`自体の`position:sticky`は削除し、影（区切り線）も`.cats`から`.filterbar`側に移設）。この下の「通常の単語⇄会話パターン」トグルや検索欄は従来通りスクロールで隠れる（要望が再生ボタンの行までだったため）。

### 主な機能
- **音声**: 3段階フォールバック（①Google翻訳の自然な音声→②Geminiキー設定時はGemini TTS→③端末TTS）。`<audio src>`からの直接リクエストのみを使い、Service Workerは一切介在しない（後述の経緯を参照）。
- **翻訳**: 2段階フォールバック（①Google翻訳→②Geminiキー設定時はGemini）。
- **話す（翻訳して発音）**: 日本語入力→選択言語へ翻訳して発音、フレーズ帳への保存も可能。「相手の番」で交互に一往復ずつ翻訳する簡易会話モードとしても使える。
- **学習ラウンジ**（旧名「練習ノート」、2026-08-12に改名。内部の変数・関数・ID・localStorageキーは`practice`/`PRACTICE_PACK`のまま変更していない＝表示名と内部名は一致しない）: 📝例文セットと💬AIに質問の2モードを持つ、`practiceOverlay`内のタブ切替UI（`.mode-tab[data-mode]`、`#practiceExamplesPane`/`#practiceChatPane`の表示切替のみでUI状態は非永続・毎回「例文セット」タブにリセット）。どちらのモードで作った項目も同じ配列`customPracticePacks`に保存され、`allPracticePacks()`が返す1つの一覧に混在して並ぶ（一覧カードの`lang-badge`はチャットなら`💬`、例文セットなら言語名で見分ける）。
  - **📝例文セット**: 単語を入力するとGemini（`gemini-flash-lite-latest`）が意味・例文・カナ・文法解説をオンデマンド生成。各例文には`gloss`（フレーズ一覧のgloss機能と同じ「Word(意味) word(意味)」形式、Geminiに生成させる）を🔤付きで表示し、どの単語がどの日本語に当たるか分かるようにしている（`PRACTICE_PACK_SCHEMA`の`examples`に`gloss`必須フィールドとして追加、無い旧データは表示自体を省略して後方互換）。表示順は文→カナ→日本語訳→🔤詳細（gloss）の順（詳細な単語対応は最後、という並びをユーザーからの指摘で採用）。**既知の不具合として修正済み**: Geminiが稀に`text`自体に`gloss`と同じ括弧注釈（"word(意味)"）を混ぜて返すことがあり、文が読みにくくなるだけでなく発音・保存にもその注釈付きテキストがそのまま使われてしまっていた。表示・発音・保存のどこでも`ex.text`を直接使わず、必ず`cleanExampleText()`（`(...)`を機械的に除去する防御的処理）を通す。プロンプト側にも「textには括弧注釈を混ぜない」旨を明記して再発防止。各例文の★ボタンから、話す機能と同じ「フレーズを追加」パネルを新規追加モードで開き（`openAddPanel(null)`＋日本語欄とその言語の欄だけ手動で値をセット、既存エントリの編集とは違い`editingEntry`は立てない）、カテゴリは空欄のままユーザーに選ばせてフレーズ帳に保存できる。
  - **💬AIに質問**（2026-08-12追加）: 「おすすめを聞く時の質問文は？」のような、単語1つに収まらない自由な質問をGeminiに投げるチャット。`generateChatReply(langKey, history, question)`が`CHAT_REPLY_SCHEMA`（`{reply: string, phrase:{text,kana,ja}}`、phraseは該当なしなら空文字列3つ）を返し、`reply`は吹き出し、`phrase.text`があればフレーズカード（🔊/★付き、★の保存先は例文セットと同じ`openAddPanel`フロー）として表示。パックは`{id, type:"chat", lang, word(=最初の質問を40字で切詰め), meaning(=直近のAI回答を40字で切詰め), messages:[{role:"user"|"ai", text, phrase?}], custom:true}`という形。詳細画面はexamples用の`#pdHead`/`#pdKana`/`#pdMeaning`/`#pdGroups`を`display:none`にし、代わりに`#pdChatWrap`（`renderChatDetail(idx)`が描画、`let openChatIdx`でどのpackへの返信か保持）を出す。フォローアップ質問（`#pdChatSendBtn`）は同じpackの`messages`に追記して保存するだけで、新しいpackは作らない。会話履歴はプロンプトに`ユーザー：`/`あなた：`形式で埋め込んで送信。
  - 一覧は新しく生成/更新した順（新しいものが上）で表示する。保存自体（`customPracticePacks`、生成順=古い順のまま）とdata-idxは変えず、`renderPracticeList()`内で表示直前にだけ`.reverse()`する（`{p,i}`のペアで元のindexを保持してからreverseするので、`openPracticeDetail(idx)`や削除ボタンの`data-idx`は引き続き`allPracticePacks()`内の実際の位置を指す）。**保存件数自体に上限は無い**（`customPracticePacks`は際限なく増える。実用上はブラウザのストレージ容量が上限になる）が、**一覧の表示件数**は設定画面の数値入力（`practiceLimitInput`、状態変数`practiceListLimit`、既定20、端末ローカル設定・同期対象外）で絞っており、`renderPracticeList()`は新しい順に並べた配列を`.slice(0, practiceListLimit)`してから描画する（削除ボタンは表示中の件数分にしか付かない＝隠れている古いノートはこの画面からは削除できない、という仕様）。超過分がある時は件数を伝えるヒントを一覧末尾に表示する。
- **メニュー翻訳（写真から）**: レストランのメニューや看板を撮影→Geminiのマルチモーダル入力で読み取り、カタカナ読みと日本語訳の一覧を生成。検出言語は13言語に限らない。当初「歌詞の翻訳一覧」案があったが、歌詞表示は著作権ライセンスが前提で個人開発では非現実的なため、ユーザー自身の写真だけを扱う設計にした。
- **端末間の同期（任意）**: Googleアカウントでログイン（常にポップアップ方式。redirectはサードパーティCookie制限で失敗するため不可）。Firebase Auth + Firestore。`/users/{uid}`単位でデータ分離、他人のデータは見えない。ローカルの保存関数（`saveCustom`/`saveCustomCats`/`savePracticePacks`/`saveLearned`/`savePinned`/`saveSettings`）を`window[fnName]`ごとラップし、呼ばれるたびに`schedulePush()`（1.2秒デバウンス）でクラウドへの反映を予約する仕組み。新しく永続化する状態を追加したら、①`getSyncableState()`/`applyCloudState()`への追加、②この配列への追加、の両方を忘れないこと（後者だけ漏れても、直後に他のラップ済み関数（大抵saveSettings）が呼ばれていれば実害は出にくいが、偶然に依存した壊れやすい状態になる）。**既知の不具合として修正済み**: デバウンス中（変更直後1.2秒以内）にタブを閉じる・アプリをバックグラウンドに回す・画面をロックすると、pushが一度もクラウドに届かないまま消えることがあった（「同期がうまくいかないことがある」という報告の主因と推定）。`visibilitychange`（hidden化）で保留中のpushがあれば即座に確定させることで対処（beforeunload/unloadはiOS Safari・PWAで信頼できないため使わない）。
  - **既知の不具合として修正済み（2）**（2026-08-14）: 「両端末とも『同期済み』表示なのにデータが食い違う」という報告の原因を特定。`pushTimer`が立っている（＝ローカルの変更をまだ一度もクラウドへ送っていない）タイミングで別端末からの`onSnapshot`更新が届くと、そのまま`applyCloudState()`していたため、未送信のローカルの変更がメモリ上でまるごと上書きされ、一度もクラウドに届かないまま消えていた（pushはエラーなく完了するので「同期済み」表示自体は嘘をつかない、という点でこれまでの不具合より発見しづらかった）。`watchRemote()`のsnapshotハンドラで、`pushTimer`が立っている間に届いたリモート更新は`applyCloudState`せずに、まず自分の保留中の変更を`pushNow()`で確定させてから戻るように修正（そのpush完了後、改めて発火するonSnapshotで通常通り調停される）。この経路は実際のFirebase同時書き込みが必要で自動テストでは再現できないため、コードレビューのみで検証済み。
- **通貨換算**: open.er-api.com（旧frankfurter.appがリダイレクトするようになったため移行済み）。オフライン時は最後に取得したレートを使用。
- **全画面提示・聞き流し再生・学習管理（覚えた✓/ピン留め📌）・自分の発音の録音比較・音声入力検索・カスタムフレーズ追加（自動翻訳ボタン付き）**なども実装済み。
  - **聞き流し再生の再生順**（2026-08-13追加）: `startListening()`は`computeFiltered()`（一覧の表示順そのもの、ピン留め優先＋phraseOrder）の結果を`orderForListening()`に通してから再生キューにする。この関数は表示順を保ったまま、`learned[learnedKey(d)]`が真のフレーズ（覚えた✓済み）だけを絞り込み範囲の最後尾へ回す安定ソート。「すべて」表示中なら全体の最後に、カテゴリを絞り込んでいればそのカテゴリの中の最後にまとまる。**一覧（`renderDeck()`）の表示順・並び替えには一切影響しない**（`computeFiltered()`自体は変更していない、`orderForListening()`は`startListening()`だけが使う）。
  - **覚えた✓は言語ごと**（2026-08-14変更）: 「英語で覚えた単語が他言語でも覚えた扱いになる」という指摘を受けて、`learned`のキーを`keyOf(d)`単体から`learnedKey(d)`（=`keyOf(d) + "::" + currentLang`）に変更。ピン留め📌は従来通り言語共通のまま（ユーザーからの要望が「覚えた」限定だったため）。**旧形式データの移行**: `loadState()`で、キーに`"::"`を含まない旧エントリを見つけたら「当時の既定表示言語だった英語で覚えたもの」とみなして`key::en`へ移行する（元データにはどの言語で覚えたかの情報が無く復元不能なため、この一律の割り当てで妥協）。カスタムフレーズに後からidを付与する既存の移行処理（`customData.forEach`内）も、`d.ja::lang`形式のキーを`d.id::lang`へ引き継ぐよう合わせて更新した。
- **カスタムフレーズの解説**（2026-08-13追加）: フレーズ追加パネルに`addNote`（`<textarea>`、任意入力）を追加し、`entry.note`として`customData`に保存する。カード側は元々`d.note || glossText`で📖解説ボタンの表示可否を判定していた（組み込みフレーズの`note`用）ので、レンダリング側の変更は不要だった＝カスタムフレーズに`note`を持たせるだけで、組み込みフレーズと全く同じ📖解説の開閉UIがそのまま動く。空欄なら（既存の挙動通り）解説ボタン自体が出ない。既存のフレーズに後から解説を付けたい場合は✎（編集）から同じ欄に入力する。
  - **学習ラウンジからの★保存時に解説も自動で引き継ぐ**（2026-08-13追加）: 「保存したのに解説が空で、組み込みフレーズと違って見える」という指摘を受けて追加。📝例文セットのpe-save（`renderPracticeList()`→`openPracticeDetail()`内）は`g.note`（グループの文法解説）＋`ex.gloss`（🔤単語対応）を改行区切りで`addNote`に、💬AIに質問のcp-save（`renderChatDetail()`内）はそのフレーズを提案したAIの回答文（`m.text`）をそのまま`addNote`に入れてから追加パネルを開く。
- **フレーズ追加パネルの`autocomplete="off"`**（2026-08-13追加）: 設定画面の`geminiKeyInput`が`type="password"`のため、他の箇所でテキスト入力→保存を行うとChromeが無関係な入力欄を「ユーザー名」候補と誤認し「パスワードを保存しますか？」ポップアップを出すことがあった。`geminiKeyInput`と、`addJa`/`addNote`/`add_${lang}`/`add_${lang}_kana`（`buildAddFields()`で動的生成）全てに`autocomplete="off"`を付けて抑制。
- **新機能のお知らせポップアップ**（2026-08-12追加）: `CHANGELOG`配列（`{id, date, title, items}`、idは追加のたびに既存の最大+1を昇順で足す）と`whatsNewSeenId`（localStorage `phrasebook-whatsnew-seen`）を比較し、未読エントリがあれば`init()`の最後で`checkWhatsNew()`が`whatsNewOverlay`をポップアップ表示する。個人利用前提のため「初回起動＝未読扱い」で構わないという判断で、新規ユーザー分岐は作っていない。**機能を追加したらCHANGELOGに1件足すこと。** テストではこのポップアップが毎回開いて他のテストのクリックをブロックしないよう、`playwright.config.js`の`use.storageState`で`phrasebook-whatsnew-seen`を`999999`（＝どんなCHANGELOG idより確実に大きい値、更新のたびにこの値を追従させる必要が無いようにするため）に既定で固定している。ポップアップ自体をテストする`tests/whats-new.spec.js`は`test.use({storageState:{cookies:[],origins:[]}})`でこの既定を打ち消して未読状態を再現している。`browser.newContext()`を自前で呼ぶテスト（`tests/sync.spec.js`のモバイルUAテストなど）は設定ファイルの既定を継承しないので、`context.addInitScript()`で個別に同じ値をセットする必要がある。
- **日本語を学ぶ（外国人向け、v1実験機能）**: 「知っている言語」を選ぶとその言語のフレーズが表になり、タップで裏の日本語＋ローマ字読み（`jaRomaji`、308件全件に用意。Google翻訳の非公式ローマ字化エンドポイントで機械生成後、漢字の読み違い等をレビュー・修正）が見える、独立オーバーレイ（`learnJaOverlay`）。周辺のツールメニュー・言語名は日本語のままなので「日本語話者が一緒に操作する」前提で、この画面自体のラベルだけ英語。カテゴリ絞り込みは無し（カテゴリ名が日本語のみのため）。組み込み308件のみが対象で`customData`は対象外（`jaRomaji`が無いため）。**日本語再生時は`speakRaw(d.ja, "ja-JP", btn)`のように第5引数(langKeyForVoice)を渡さないこと** — "ja"はLANGSに存在しないキーなので、渡すとフォールバック時に`pickVoice("ja")`内で`meta`がundefinedになりクラッシュする（他のJapanese再生箇所と同じ理由、`tests/learn-japanese.spec.js`に回帰防止テストあり）。

### オフライン対応
- `sw.js`はアプリ本体（同一オリジンのシェルファイル）のみキャッシュする。**翻訳・音声合成・為替・Gemini・同期などの外部APIは素通しで、Service Workerは関与しない。**
- 一度はGoogle音声合成（translate_tts）もService Worker側でfetch()して横取り・キャッシュする実装を試したが、実機検証で「fetch()経由のリクエストだとGoogle側が404を返すことがあるが、`<audio src>`からの直接リクエストは安定して成功する」という挙動が判明し撤去した。キャッシュの横取り自体がオンライン時も含め偶発的な再生失敗を招きうる状態だったため、確実性を優先している。**この種のキャッシュを復活させる提案が出たら、この経緯を踏まえて慎重に検討すること。**
- シェルファイルのfetchにはAbortControllerで8秒のタイムアウトを設定している。理由: 通常のfetch()はページ側のsetTimeoutより先にハングすることがあり、その場合ページ側のタイマーが発火しないことが実機検証で判明したため、Service Worker側で確実に打ち切る必要があった。

### 設定・APIキー
- Gemini APIキーはGoogle AI Studioでユーザー自身が無料発行（カード登録不要）し、設定画面で`type="password"`のマスク入力欄に保存。localStorageのみに保持され、リポジトリには含まれない。学習ラウンジ・メニュー翻訳・翻訳/TTSフォールバックで共通利用。
- `firebaseConfig`の値は秘密情報ではない（アクセス制御はFirestoreルール側）。

## ファイル構成
```
index.html          アプリ本体（UI・データ・ロジック全て、単一ファイル、約752KB）
manifest.json        PWAマニフェスト
sw.js                 Service Worker（オフラインシェルキャッシュのみ、v2）
firestore.rules       Firestoreセキュリティルール
tests/                Playwright仕様15本 + data-integrity.test.js + helpers.js（外部APIのモック）+ fixtures/（既定storageState）
playwright.config.js  chromium・iPhone13(webkit)の2プロジェクト、計236テスト
.github/workflows/test.yml  push/PRごとの自動テストCI
```

## 作業上の注意点

- **git**: pushする前に必ず `git fetch origin && git log HEAD..origin/main --oneline` で他セッションの先行コミットを確認する（このリポジトリに対して複数のClaudeセッションが並行で作業することがある）。
- **テスト**: `npm test`（chromium+webkit）、`npm run test:data`（データ整合性のみ、ブラウザ不要）。実装を変更したら関連テストを追加・更新し、フルスイートを通してからコミットする。
- **既知のテストの制約**（アプリの不具合と誤認しないこと）: Playwright WebKitはroute intercept（フェッチの差し替え）が一部信頼できず、該当テストは理由付きで`test.skip`している。Service Workerが自前でfetch()する経路はPlaywrightの`page.route()`では捕捉できないため、そうしたテストは`serviceWorkers:'block'`でSWを無効化する。実際のGoogle OAuthポップアップを開くテストは外部ネットワーク依存でたまに失敗し再実行で通ることがある。
- **CI確認**: `gh` CLIは未インストール。GitHub Actionsの結果は `curl https://api.github.com/repos/kensukexx/phrasebook/actions/runs` を `python3 -c "json.loads(sys.stdin.read(), strict=False)"`（コミットメッセージの制御文字に耐えるため`strict=False`）でパースして確認する。
- **著作権**: 歌詞・書籍・記事等の著作物本文をそのまま扱う機能は追加しない（メニュー翻訳はユーザー自身が撮った写真のみを扱う設計にした経緯があるため、同種の提案が来たら要注意）。
- **URLの扱い**: 実在しないURL・短縮URLを勝手に作って案内しない。
- **仕様書アーティファクト**: `https://claude.ai/code/artifact/e96e8ae0-0258-4649-9df8-fdb623d7fe24`（「ツウジル — 仕様書」）に、このファイルより詳細な仕様書（表・スキーマ付き）を維持している。機能追加時はこのCLAUDE.mdと合わせて更新し、同じURLに再publishすること。
