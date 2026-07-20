# Sekai Music Library

プロジェクトセカイの楽曲データベースを閲覧できる静的 Web アプリです。GitHub Pages でそのまま公開できるように、ビルド不要の素の HTML / CSS / JavaScript（ESモジュール）のみで構成しています。

## GitHub Pages への公開方法

1. このフォルダの中身一式（`index.html` を含む）を GitHub リポジトリのルート（または `/docs` フォルダ）にそのままコミット＆プッシュします。
2. リポジトリの **Settings → Pages** で、公開元のブランチとフォルダ（`/root` もしくは `/docs`）を指定します。
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセスできます。

ビルドステップは一切不要です。すべてのデータ（楽曲情報・キャラクター情報・音声・ジャケット画像）は、ページを開いたブラウザが [sekai-world/sekai-master-db-diff](https://github.com/Sekai-World/sekai-master-db-diff) と `storage.sekai.best` から直接取得します。そのため、リポジトリ自体には楽曲データや音声ファイルは一切含まれません。

## ファイル構成

```
index.html              楽曲一覧ページ
song.html                楽曲詳細ページ（?id=楽曲ID）

css/
  variables.css           デザイントークン（配色・タイポグラフィ・余白など）
  base.css                 リセット・基本スタイル
  components.css            ボタン・チップ・キャラアイコン・シート（モーダル）等の共通部品
  layout.css                 ヘッダーなど共通レイアウト
  list.css                    一覧ページ専用（ツールバー・1/3/5列表示・検索候補）
  detail.css                   詳細ページ専用（ボーカル選択・難易度スペクトラム等）
  player.css                    再生バー・ミニプレイヤー

js/
  urls.js                  各種アセットURLの組み立て、難易度の並び順・表示名
  utils.js                  かな正規化検索・日付/時間整形・シート開閉共通処理 等の汎用関数
  icons.js                  絵文字を使わないアイコン（インラインSVG）一式
  settings.js                冒頭無音スキップ設定の保存・設定シートの配線

  data/
    api.js                  マスターデータ取得＋sessionStorageキャッシュ
    characters.js            生データを楽曲オブジェクト／キャラクター索引に正規化

  list/
    filter-sort.js          絞り込み・並び替え・検索のロジック（DOM非依存）
    render.js                 1列／3列／5列レイアウトの描画
    controls.js                検索候補・並び替え・絞り込みシートの操作配線
    main.js                     一覧ページのエントリーポイント

  player/
    engine.js                <audio> の薄いラッパー（遅延取得・±5秒・無音スキップ・Media Session）
    ui.js                      再生バー／ミニプレイヤーのDOM連携

  detail/
    render.js                詳細ページのDOM生成（ヒーロー／情報リスト／難易度スペクトラム）
    main.js                    詳細ページのエントリーポイント
```

機能・処理・役割ごとにファイルを分割しているため、たとえば「並び替えの条件を増やしたい」→ `list/filter-sort.js`、「アイコンを差し替えたい」→ `icons.js` のように、変更箇所を局所化できます。

## データソース（すべて実行時にブラウザが取得）

| 用途 | URL |
|---|---|
| 楽曲情報 | `sekai-master-db-diff/musics.json` |
| 難易度・レベル・ノーツ数 | `sekai-master-db-diff/musicDifficulties.json` |
| ボーカルバージョン | `sekai-master-db-diff/musicVocals.json` |
| ゲーム内キャラクター | `sekai-master-db-diff/gameCharacters.json` |
| ゲーム外キャラクター | `sekai-master-db-diff/outsideCharacters.json` |
| ユニットタグ | `sekai-master-db-diff/musicTags.json` |
| オリジナルビデオ | `sekai-master-db-diff/musicOriginals.json` |
| 音声 (mp3) | `storage.sekai.best/.../music/long/{assetbundleName}/{assetbundleName}.mp3` |
| ジャケット画像 | `storage.sekai.best/.../music/jacket/jacket_s_{楽曲ID}/jacket_s_{楽曲ID}.png` |
| キャラクターアイコン | `storage.sekai.best/.../character/character_sd_l/chr_sp_{キャラID}.png` |

データは [Sekai-World/sekai-master-db-diff](https://github.com/Sekai-World/sekai-master-db-diff) および `storage.sekai.best` の非公式データを利用しています。本アプリはファンメイドの非公式ツールであり、SEGA / Colorful Palette / Crypton Future Media とは無関係です。

## 実装した機能

- 一覧：タイトル1列 / サムネイル3列 / サムネイル5列の切り替え（狭い画面では5列を自動非表示、3列でも収まらない場合はサムネイル・文字を自動縮小）
- 並び替え：タイトル名（読み仮名基準）／ID／楽曲レベル（基準難易度を選択可）／公開日時、各昇順・降順
- 絞り込み：ユニットタグ（単一選択）／書き下ろし・カバー（単一選択）／歌唱キャラクター（アイコン選択・AND検索）
- 検索：楽曲タイトル・作詞・作曲・編曲者を対象に、ひらがな/カタカナを正規化してリアルタイム検索（候補表示つき）
- 詳細ページ：タイトル→サムネイル→ボーカル選択→再生バー→ID→タイトル/読み方→ユニット→作詞→作曲→編曲→公開日時→オリジナルビデオ→難易度別レベル・ノーツ数、の順に表示
- オリジナルビデオボタンは押下後に確認ダイアログを表示してから外部サイトへ遷移
- 音声は「詳細ページを開き、ボーカルを選択した」タイミングでのみ取得（一覧表示時や未選択時には一切取得しない）。再生も自動再生せず、再生ボタン押下時のみ
- 再生バーに5秒戻す／進むボタンを搭載。Media Session API 経由でバックグラウンド再生・ロック画面にジャケットを表示
- 設定画面から「冒頭の無音スキップ（オンで 0:08 から再生開始）」のオン・オフを切り替え可能（設定はブラウザに保存され次回以降も維持）
- 絵文字は不使用、すべてインラインSVGアイコンで統一
- キャラクターアイコンは4列表示、ゲーム外キャラクターは名前表示

## 動作環境について

- モダンブラウザ（Chrome / Safari / Edge / Firefox の最新版）を想定しています。
- 音声・画像・マスターデータの取得先ドメインへの通信がブロックされていないネットワーク環境が必要です。
- 一覧・絞り込みの状態、表示列数、無音スキップ設定は `localStorage` に保存されます。マスターデータ本体は `sessionStorage` に一時キャッシュされ、一覧⇔詳細間の遷移で再取得を減らします。
