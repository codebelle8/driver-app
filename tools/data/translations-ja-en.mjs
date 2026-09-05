/**
 * 施設データの英訳。
 *
 * **なぜ表にして持つか**
 *   機械翻訳へ都度投げる作りにすると、鍵と課金が要るうえ、
 *   同じ入力でも時期によって訳が変わる。ここに置けば、
 *   何をどう訳したかが後から読めて、直したい箇所だけ直せる。
 *
 * **正式な英名を優先する**
 *   「帝国ホテル東京」は Imperial Hotel, Tokyo であって
 *   Teikoku Hotel ではない。ホテルには看板に出ている英名があり、
 *   外国人ドライバーが照合するのはその名前。読みの写しでは役に立たない。
 *
 * **住所は町名の読みから組み立てる**
 *   「六本木一丁目」「六本木二丁目」…と個別に持つと、同じ町名の
 *   読みが場所によって食い違う。町名の読みだけを持ち、丁目は
 *   数に直して並べる。
 *
 * **訳の無いものは日本語のまま出す**
 *   足りない分で英語表示を止めることはしない。半分でも読めるほうがよい。
 */

/** 都道府県 */
export const PREFECTURES = {
  東京都: 'Tokyo',
  千葉県: 'Chiba',
};

/** 市区町村 */
export const CITIES = {
  千代田区: 'Chiyoda-ku',
  中央区: 'Chuo-ku',
  港区: 'Minato-ku',
  新宿区: 'Shinjuku-ku',
  文京区: 'Bunkyo-ku',
  台東区: 'Taito-ku',
  墨田区: 'Sumida-ku',
  江東区: 'Koto-ku',
  品川区: 'Shinagawa-ku',
  目黒区: 'Meguro-ku',
  大田区: 'Ota-ku',
  渋谷区: 'Shibuya-ku',
  豊島区: 'Toshima-ku',
  荒川区: 'Arakawa-ku',
  浦安市: 'Urayasu',
};

/**
 * 町名の読み。丁目は付けない。
 *
 * 区の切れ目はハイフンで示す（東品川 → Higashi-Shinagawa）。
 * 郵便局の英語表記に合わせている。
 */
export const AREAS = {
  一番町: 'Ichibancho',
  三田: 'Mita',
  下目黒: 'Shimo-Meguro',
  丸の内: 'Marunouchi',
  京橋: 'Kyobashi',
  代々木: 'Yoyogi',
  八重洲: 'Yaesu',
  六本木: 'Roppongi',
  内幸町: 'Uchisaiwaicho',
  北品川: 'Kita-Shinagawa',
  千鳥: 'Chidori',
  南大井: 'Minami-Oi',
  南大塚: 'Minami-Otsuka',
  南青山: 'Minami-Aoyama',
  南麻布: 'Minami-Azabu',
  台場: 'Daiba',
  外神田: 'Soto-Kanda',
  大井: 'Oi',
  大崎: 'Osaki',
  大手町: 'Otemachi',
  富士見: 'Fujimi',
  平河町: 'Hirakawacho',
  後楽: 'Koraku',
  新富: 'Shintomi',
  新川: 'Shinkawa',
  新橋: 'Shimbashi',
  日の出: 'Hinode',
  日本橋室町: 'Nihonbashi-Muromachi',
  日本橋蛎殻町: 'Nihonbashi-Kakigaracho',
  明海: 'Akemi',
  明石町: 'Akashicho',
  有明: 'Ariake',
  有楽町: 'Yurakucho',
  本郷: 'Hongo',
  東上野: 'Higashi-Ueno',
  東五反田: 'Higashi-Gotanda',
  東品川: 'Higashi-Shinagawa',
  東新橋: 'Higashi-Shimbashi',
  東日暮里: 'Higashi-Nippori',
  東池袋: 'Higashi-Ikebukuro',
  東糀谷: 'Higashi-Kojiya',
  東陽: 'Toyo',
  東麻布: 'Higashi-Azabu',
  桜丘町: 'Sakuragaokacho',
  横網: 'Yokoami',
  歌舞伎町: 'Kabukicho',
  永田町: 'Nagatacho',
  池袋: 'Ikebukuro',
  浅草: 'Asakusa',
  海岸: 'Kaigan',
  渋谷: 'Shibuya',
  港南: 'Konan',
  潮見: 'Shiomi',
  白金台: 'Shirokanedai',
  神宮前: 'Jingumae',
  神田佐久間町: 'Kanda-Sakumacho',
  神田淡路町: 'Kanda-Awajicho',
  紀尾井町: 'Kioicho',
  美浜: 'Mihama',
  羽田: 'Haneda',
  羽田旭町: 'Haneda-Asahicho',
  羽田空港: 'Haneda Airport',
  舞浜: 'Maihama',
  芝: 'Shiba',
  芝公園: 'Shibakoen',
  芝浦: 'Shibaura',
  花川戸: 'Hanakawado',
  蒲田: 'Kamata',
  虎ノ門: 'Toranomon',
  西五反田: 'Nishi-Gotanda',
  西新宿: 'Nishi-Shinjuku',
  西早稲田: 'Nishi-Waseda',
  西池袋: 'Nishi-Ikebukuro',
  西蒲田: 'Nishi-Kamata',
  豊洲: 'Toyosu',
  赤坂: 'Akasaka',
  道玄坂: 'Dogenzaka',
  銀座: 'Ginza',
  錦糸: 'Kinshi',
  関口: 'Sekiguchi',
  雷門: 'Kaminarimon',
  飯田橋: 'Iidabashi',
  高田馬場: 'Takadanobaba',
  高輪: 'Takanawa',
  麻布台: 'Azabudai',
};

/** 入口の名前 */
export const ENTRY_NAMES = {
  車寄せ: 'Drop-off',
  'エントランス': 'Entrance',
  '車寄せ（進入路 1）': 'Drop-off (approach 1)',
  '車寄せ（進入路 2）': 'Drop-off (approach 2)',
};

/** カテゴリ */
export const CATEGORIES = {
  hotel: 'Hotels',
  residence: 'Residences',
  commercial: 'Shopping centres',
  office: 'Office buildings',
  hospital: 'Hospitals',
  station: 'Stations & airports',
};

/**
 * 進入方法の説明。
 *
 * 直訳にしない。ドライバーが車の中で読むもので、
 * 「どこを曲がるか」「どこに着けるか」が要点。
 * 主語を補い、動作の順に並べ直している。
 */
export const APPROACH_TEXTS = {
  '現地調査前です。座標のみ登録されています。到着後の進入方法は追ってお知らせします。':
    'Not yet surveyed. Only the coordinates are registered. Approach details will follow.',
  '夜間は地下入口閉鎖の為、1階':
    'The basement entrance is closed at night, so use the ground floor.',
  '通路奥から地下へ': 'Go to the end of the passage, then down to the basement.',
  '通路スロープを上がり、通路一番奥へ':
    'Go up the ramp in the passage and continue to the far end.',
  'B2F・エレベーターホールから１F': 'From the B2 lift lobby, go up to the ground floor.',
  '通路奥': 'At the far end of the passage.',
  'エントランス正面がバス停の為、その前後の停車':
    'There is a bus stop directly in front of the entrance. Stop just before or after it.',
  'ロータリー手前ホテル駐車場入り口に車寄せあり':
    'The drop-off is at the hotel car park entrance, just before the roundabout.',
  '駐車場入り口付近にて昇降': 'Pick up and drop off near the car park entrance.',
  'ロータリータクシー降場にて昇降': 'Use the taxi drop-off point in the roundabout.',
  '敷地内右奥に進むと左に車寄せあり':
    'Enter the grounds, head to the far right, and the drop-off is on your left.',
  'スロープを上がった所に車寄せあり': 'The drop-off is at the top of the ramp.',
  '敷地に入り左方向アンダーパスを潜り通路を進むと車寄せあり':
    'Enter the grounds, bear left through the underpass, and follow the passage to the drop-off.',
  '通路スロープから地下へ': 'Take the ramp in the passage down to the basement.',
  '地下駐車場B2Fから27F': 'From the B2 car park, go up to the 27th floor.',
  '敷地内、スロープを上がると車寄せあり':
    'Inside the grounds, go up the ramp to reach the drop-off.',
  'サブエントランス': 'Use the side entrance.',
  'ポイントの手前50ｍ右から車寄せに入れるが通り沿いがベター':
    'You can enter the drop-off from the right about 50 m before the pin, but stopping on the street is easier.',
  '敷地内奥に車寄せ': 'The drop-off is at the back of the grounds.',
  '敷地内左の建物に車寄せ': 'The drop-off is at the building on the left of the grounds.',
  '敷地内左奥に進みスロープを上がると車寄せがある':
    'Head to the far left of the grounds and go up the ramp to the drop-off.',
  'ホテルニューオータニ東京内': 'Inside Hotel New Otani Tokyo.',
  '敷地内右奥に進むと車寄せあり': 'Head to the far right of the grounds to reach the drop-off.',
  '敷地内スロープを上がり奥から右回りに進むと車寄せあり':
    'Go up the ramp in the grounds, then bear right at the back to reach the drop-off.',
  'ロータリーに入り直ぐ左': 'Enter the roundabout and turn left immediately.',
  '敷地内からスロープを上がると車寄せあり':
    'From inside the grounds, go up the ramp to the drop-off.',
  '敷地内狭いので注意': 'The grounds are narrow — take care.',
  '外苑東通り沿いでの送迎なので停車位置に注意':
    'Pick-ups and drop-offs are on Gaien-Higashi-dori. Take care where you stop.',
  '夜間の送迎と昼間の送りは1階エントランス、昼間の迎えはB1F':
    'At night, and for daytime drop-offs, use the ground-floor entrance. For daytime pick-ups, use B1.',
  '１FはレジデンスA、ホテルはスロープを下ってB1Fへ':
    'The ground floor is Residence A. For the hotel, take the ramp down to B1.',
  '敷地内左奥にホテル車寄せ、出口に向かうと宴会場車寄せあり':
    'The hotel drop-off is at the far left of the grounds; the banquet-hall drop-off is on the way out.',
  '敷地に入ってホテル裏手に車寄せあり':
    'Enter the grounds; the drop-off is behind the hotel.',
  'ターミナル２、出発フロア入口１を入って左にエントランス':
    'Terminal 2. Enter the departures floor at Entrance 1; the entrance is on your left.',
  '敷地奥を左に曲がると車寄せあり':
    'Turn left at the back of the grounds to reach the drop-off.',
  'ターミナル３、入口Dを入り正面エレベーターで３Fへ':
    'Terminal 3. Enter at Door D and take the lift straight ahead to the 3rd floor.',
  '敷地に入って右奥に車寄せ':
    'Enter the grounds; the drop-off is at the far right.',
  'グランドシャトー同じ車寄せ': 'Same drop-off as the Grand Chateau.',
  '１Fはバス専用、スロープを上がって２Fに車寄せ':
    'The ground floor is for buses only. Go up the ramp; the drop-off is on the 2nd floor.',
  '交差点内にエントランス入口あり': 'The entrance is on the junction itself.',
  '奥が入口、八の字回り': 'The entrance is at the back; drive round in a figure of eight.',
  'ゲートあり': 'There is a gate.',
  '入って左周りで2階に上がる': 'Enter and bear left, going up to the 2nd floor.',
};
