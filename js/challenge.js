// =========================================================
//  チャレンジモード：特殊ルールのボスに順番に挑む
//  クリアするとカードの裏面デザインが手に入る
// =========================================================

/** カードの裏面デザイン */
export const BACKS = {
  default: { name: '夜空', desc: 'はじめから使える' },
  club: { name: '翠樹', desc: 'ステージ1 クリア' },
  spade: { name: '黒鋼', desc: 'ステージ2 クリア' },
  heart: { name: '紅炎', desc: 'ステージ3 クリア' },
  diamond: { name: '蒼晶', desc: 'ステージ4 クリア' },
  fortress: { name: '城塞', desc: 'ステージ5 クリア' },
  joker: { name: '虹', desc: 'ステージ6 クリア' },
  gold: { name: '黄金', desc: 'ステージ7 クリア' },
  royal: { name: '王家', desc: 'ステージ8 クリア' },
};

/**
 * ステージ
 *  cpu: 相手のデッキ・初期状態（engine の setup）
 *  me : 自分の初期状態
 */
export const STAGES = [
  {
    boss: '森番モス', icon: '♣', suit: 'C', level: 'easy', reward: 'club',
    desc: 'まずは腕だめし。ふつうのデッキで勝負！',
    rules: ['ルールはいつもどおり'],
    cpu: {},
  },
  {
    boss: '黒鋼の斥候隊長ジン', icon: '♠', suit: 'S', level: 'normal', reward: 'spade',
    desc: '♠だけで組んだ速攻デッキ。出たターンから殴ってくる！',
    rules: ['相手のデッキは ♠ のカードだけ（3組分）'],
    cpu: { deck: { suits: ['S'], copies: 3, jokers: 1 } },
  },
  {
    boss: '不死鳥の女王フレイア', icon: '♥', suit: 'H', level: 'normal', reward: 'heart',
    desc: '倒しても倒しても炎になってマナへ還る、紅炎の女王。',
    rules: ['相手のデッキは ♥ だけ', '相手は最初からマナ2枚'],
    cpu: { deck: { suits: ['H'], copies: 3, jokers: 1 }, mana: 2 },
  },
  {
    boss: '蒼晶大賢者アルカナ', icon: '♦', suit: 'D', level: 'hard', reward: 'diamond',
    desc: '手札の数で圧倒してくる知恵者。',
    rules: ['相手のデッキは ♦ だけ', '相手の最初の手札は7枚'],
    cpu: { deck: { suits: ['D'], copies: 3, jokers: 1 }, hand: 7 },
  },
  {
    boss: '翠樹城塞ガイアフォート', icon: '♣', suit: 'C', level: 'hard', reward: 'fortress',
    desc: 'ブロッカーの壁とぶ厚いシールド。崩せるか？',
    rules: ['相手のデッキは ♣ だけ', '相手のシールドは8枚'],
    cpu: { deck: { suits: ['C'], copies: 3, jokers: 1 }, shields: 8 },
  },
  {
    boss: '道化師たちの宴', icon: '★', suit: 'X', level: 'hard', reward: 'joker',
    desc: 'ジョーカーだらけの大混戦。S・トリガーに気をつけろ！',
    rules: ['相手のデッキにジョーカー6枚', 'あなたのデッキにもジョーカー3枚'],
    cpu: { deck: { jokers: 6 } },
    me: { deck: { jokers: 3 } },
  },
  {
    boss: '四天王', icon: '♛', suit: 'X', level: 'hard', reward: 'gold',
    desc: '4つの文明をすべて使いこなす精鋭。',
    rules: ['相手のシールドは6枚', '相手は最初からマナ3枚'],
    cpu: { shields: 6, mana: 3 },
  },
  {
    boss: '黒鋼皇帝カイザー・ネロ', icon: '♚', suit: 'S', level: 'hard', reward: 'royal',
    desc: '大型クリーチャーとドラゴンだけで固めた皇帝のデッキ。最後の戦い！',
    rules: ['相手のデッキは A・8・9・10・Q・K だけ（2組分）', '相手のシールド7枚・マナ2枚'],
    cpu: { deck: { ranks: [1, 8, 9, 10, 12, 13], copies: 2, jokers: 2 }, shields: 7, mana: 2 },
  },
];
