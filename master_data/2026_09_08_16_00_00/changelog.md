# master_data changelog: 2026_09_08_00_00_00 → 2026_09_08_16_00_00

## 总览

| 表 | 新增 | 删除 | 调整 |
|---|---:|---:|---:|
| weapons | 0 | 0 | 18 |
| weapon_costumes | 3 | 0 | 0 |
| materials | 1 | 0 | 0 |
| items | 5 | 1 | 0 |

## weapons

### 调整 (18)

- [`112901`](weapons.json#L51147) ダインスレイフ
  - base_name: ダインスレイフ (costume: 魔装)
  - element=闇(5) / type=長剣(1) / rarity=S(3) / cv=山村響
  - max stats: HP=9600 / ATK=10000 / DEF=7200 / SPD=30 / BREAK=3000
  - hit_counts=[2, 1, 2] (3段)  motion_speed=[4.0/4.0/1.0]  mp=200
  - three_size=82/54/79 / **initial_slot=3 → 4**
  - BD: ブラッディ†パーティ (arts_id=129)
    - description: 敵全体に超強力な22連ダメージ＆一瞬だけスピード狂化
    - cost=3 / hit_count=22 / value=3.0 / additional_value=0.0
  - innate skills (1):
    - Attack Multiply ×1.5 — 闇属性の魔剣の攻撃力が大幅にアップ
- [`112902`](weapons.json#L51285) ダインスレイフ【極】
  - base_name: ダインスレイフ (costume: 極魔装)
  - element=闇(5) / type=長剣(1) / rarity=S(3) / cv=山村響
  - max stats: HP=12400 / ATK=13000 / DEF=9300 / SPD=30 / BREAK=3900
  - hit_counts=[3, 1, 5] (3段)  motion_speed=[4.0/4.0/1.0]  mp=200
  - three_size=82/54/79 / **initial_slot=4 → 5**
  - BD: ブラッディ†パーティ (arts_id=129)
    - description: 敵全体に超強力な22連ダメージ＆一瞬だけスピード狂化
    - cost=3 / hit_count=22 / value=3.0 / additional_value=0.0
  - innate skills (3):
    - **新增: Attack Multiply ×1.4969 — 闇属性の魔剣の攻撃力が大幅にアップ【熟度UPにつれてさらに効果値UP】**
    - **新增: MotionSpeed Multiply ×2.0 — 自身の攻撃モーションが2倍に加速**
    - **新增: DamageLimitBreak Addition +1000000000.0 — 自身のダメージ上限が10億アップ**
    - **删除: Attack Multiply ×1.5 — 闇属性の魔剣の攻撃力が大幅にアップ**
- [`112903`](weapons.json#L51461) ダインスレイフ【極弐】
  - base_name: ダインスレイフ (costume: 極弐魔装)
  - element=闇(5) / type=長剣(1) / rarity=S(3) / cv=山村響
  - max stats: HP=16120 / ATK=16900 / DEF=12090 / SPD=38 / BREAK=5070
  - hit_counts=[4, 2, 5] (3段)  motion_speed=[3.0/3.0/1.0]  mp=240
  - three_size=82/54/79 / **initial_slot=5 → 6**
  - BD: ブラッディ†ドミネーション (arts_id=10129)
    - description: 敵全体に超強力な22連ダメージ＆一瞬だけスピード狂化
    - cost=3 / hit_count=22 / value=3.0 / additional_value=0.0
  - innate skills (3):
    - **新增: Attack Multiply ×1.74232 — 闇属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】**
    - **新增: MotionSpeed Multiply ×2.0 — 自身の攻撃モーションが2倍に加速**
    - **新增: DamageLimitBreak Addition +1000000000.0 — 自身のダメージ上限が10億アップ**
    - **删除: Attack Multiply ×1.75 — 闇属性の魔剣の攻撃力が絶大にアップ**
- [`115701`](weapons.json#L62459) 塵地螺鈿飾剣
  - base_name: 塵地螺鈿飾剣 (costume: 魔装)
  - element=火(1) / type=太刀(3) / rarity=S(3) / cv=清都ありさ
  - max stats: HP=6700 / ATK=6200 / DEF=8200 / SPD=26 / BREAK=3200
  - hit_counts=[1, 2, 4] (3段)  motion_speed=[4.0/4.0/1.0]  mp=154
  - three_size=74/57/74 / initial_slot=2
  - BD: 純情可憐絢爛豪華 (arts_id=157)
    - description: 敵全体に超強力な33連ダメージ＆攻撃力+500
    - cost=5 / hit_count=33 / value=3.0 / additional_value=0.0
  - innate skills (1):
    - **新增: Attack Multiply ×1.5 — 火属性の魔剣の攻撃力が大幅にアップ**
    - **删除: Attack Multiply ×1.25 — 火属性の魔剣の攻撃力がかなりアップ**
- [`115702`](weapons.json#L62597) 塵地螺鈿飾剣【極】
  - base_name: 塵地螺鈿飾剣 (costume: 極魔装)
  - element=火(1) / type=太刀(3) / rarity=S(3) / cv=清都ありさ
  - max stats: HP=8710 / ATK=8060 / DEF=10660 / SPD=26 / BREAK=4160
  - hit_counts=[2, 2, 7] (3段)  motion_speed=[4.0/4.0/1.0]  mp=154
  - three_size=74/57/74 / initial_slot=3
  - BD: 純情可憐絢爛豪華 (arts_id=157)
    - description: 敵全体に超強力な33連ダメージ＆攻撃力+500
    - cost=5 / hit_count=33 / value=3.0 / additional_value=0.0
  - innate skills (2):
    - **新增: Attack Multiply ×1.4969 — 火属性の魔剣の攻撃力が大幅にアップ【熟度UPにつれてさらに効果値UP】**
    - **新增: DamageLimitBreak Addition +700000000.0 — 火属性の魔剣のダメージ上限が7億アップ**
    - **删除: Attack Multiply ×1.5 — 火属性の魔剣の攻撃力が大幅にアップ**
- [`115703`](weapons.json#L62754) 塵地螺鈿飾剣【極弐】
  - base_name: 塵地螺鈿飾剣 (costume: 極弐魔装)
  - element=火(1) / type=太刀(3) / rarity=S(3) / cv=清都ありさ
  - max stats: HP=12452 / ATK=12672 / DEF=13792 / SPD=26 / BREAK=4992
  - hit_counts=[3, 3, 7] (3段)  motion_speed=[4.0/4.0/1.1]  mp=165
  - three_size=75/57/74 / initial_slot=4
  - BD: 精華艶麗金荘極彩 (arts_id=10157)
    - description: 敵全体に超強力な33連ダメージ＆数秒間攻撃力1.5倍
    - cost=5 / hit_count=33 / value=3.0 / additional_value=0.0
  - innate skills (2):
    - **新增: Attack Multiply ×1.74232 — 火属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】**
    - **新增: DamageLimitBreak Addition +700000000.0 — 火属性の魔剣のダメージ上限が7億アップ**
    - **删除: Attack Multiply ×1.75 — 火属性の魔剣の攻撃力が絶大にアップ**
- [`117401`](weapons.json#L69131) ロンゴミアント=オズ
  - base_name: ロンゴミアント=オズ (costume: 魔装)
  - element=水(2) / type=騎槍(8) / rarity=SS(4) / cv=久保ユリカ
  - max stats: HP=15900 / ATK=21130 / DEF=6500 / SPD=28 / BREAK=999
  - hit_counts=[3, 6, 10] (3段)  motion_speed=[2.0/3.0/1.0]  mp=255
  - three_size=89/52/70 / initial_slot=3
  - BD: Over-Zenith《贖罪》 (arts_id=174)
    - description: 敵全体に超絶強力な50連ダメージ＆味方HP回復
    - cost=5 / hit_count=50 / value=7.325 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×1.74232 — 水属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - InstantDeath Repel_Percent ×50.0 — 即死特性の攻撃を確率で回避する
    - DamageLimitBreak Addition **+1000000000.0 → +2000000000.0** — **自身のダメージ上限が10億アップ → 自身のダメージ上限が20億アップ**
- [`117402`](weapons.json#L69307) ロンゴミアント=オズ【極】
  - base_name: ロンゴミアント=オズ (costume: 極魔装)
  - element=水(2) / type=騎槍(8) / rarity=SS(4) / cv=久保ユリカ
  - max stats: HP=20670 / ATK=27469 / DEF=8450 / SPD=28 / BREAK=1300
  - hit_counts=[4, 6, 13] (3段)  motion_speed=[2.0/3.0/1.0]  mp=255
  - three_size=89/52/70 / initial_slot=4
  - BD: Over-Zenith《贖罪》 (arts_id=174)
    - description: 敵全体に超絶強力な50連ダメージ＆味方HP回復
    - cost=5 / hit_count=50 / value=7.325 / additional_value=0.0
  - innate skills (3):
    - Attack Multiply ×2.0 — 水属性の魔剣の攻撃力が超絶大アップ【熟度UPにつれてさらに効果値UP】
    - InstantDeath Repel_Percent ×100.0 — 即死特性の攻撃を完全回避する
    - DamageLimitBreak Addition **+1000000000.0 → +2000000000.0** — **自身のダメージ上限が10億アップ → 自身のダメージ上限が20億アップ**
- [`141801`](weapons.json#L167862) ジャガーノート=ルナ
  - base_name: ジャガーノート=ルナ (costume: 魔装)
  - element=闇(5) / type=騎槍(8) / rarity=SS(4) / cv=三森すずこ
  - max stats: HP=13050 / ATK=13800 / DEF=10750 / SPD=38 / BREAK=1560
  - hit_counts=[5, 3, 9] (3段)  motion_speed=[4.0/4.0/1.0]  mp=380
  - three_size=77/54/72 / initial_slot=3
  - BD: L.U.N.A.C.Y. (arts_id=418)
    - description: 敵全体に超絶強力な52連ダメージ＆味方HP回復
    - cost=5 / hit_count=52 / value=3.5 / additional_value=0.0
  - innate skills (4):
    - Vitality_Attack Multiply ×2.25 — 残HPが多いほど攻撃力が絶大にアップ
    - Attack Multiply ×1.74232 — 闇属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - Vitality_Speed Multiply ×1.3 — 残HPが多いほどスピードがかなりアップ
    - DamageLimitBreak Addition **+500000000.0 → +1000000000.0** — **闇属性の魔剣のダメージ上限が5億アップ → 闇属性の魔剣のダメージ上限が10億アップ**
- [`141802`](weapons.json#L168057) ジャガーノート=ルナ【極】
  - base_name: ジャガーノート=ルナ (costume: 極魔装)
  - element=闇(5) / type=騎槍(8) / rarity=SS(4) / cv=三森すずこ
  - max stats: HP=16970 / ATK=17940 / DEF=13980 / SPD=38 / BREAK=2030
  - hit_counts=[6, 3, 12] (3段)  motion_speed=[4.0/4.0/1.0]  mp=380
  - three_size=77/54/72 / initial_slot=4
  - BD: L.U.N.A.C.Y. (arts_id=418)
    - description: 敵全体に超絶強力な52連ダメージ＆味方HP回復
    - cost=5 / hit_count=52 / value=3.5 / additional_value=0.0
  - innate skills (4):
    - Vitality_Attack Multiply ×2.55 — 残HPが多いほど攻撃力が超絶大にアップ
    - Attack Multiply ×2.0 — 闇属性の魔剣の攻撃力が超絶大アップ【熟度UPにつれてさらに効果値UP】
    - Vitality_Speed Multiply ×1.8 — 残HPが多いほどスピードが大幅にアップ
    - DamageLimitBreak Addition **+500000000.0 → +1000000000.0** — **闇属性の魔剣のダメージ上限が5億アップ → 闇属性の魔剣のダメージ上限が10億アップ**
- [`151101`](weapons.json#L206269) エクセルシヌス=メアリー
  - base_name: エクセルシヌス=メアリー (costume: 魔装)
  - element=火(1) / type=大鎌(12) / rarity=SS(4) / cv=高柳知葉
  - max stats: HP=6000 / ATK=27000 / DEF=11000 / SPD=25 / BREAK=800
  - hit_counts=[2, 4, 8] (3段)  motion_speed=[2.0/2.0/1.2]  mp=1000
  - three_size=74/59/76 / initial_slot=3
  - BD: 遍くを喰らえ偽証の晩餐 (arts_id=511)
    - description: 敵全体に超絶強力な50連ダメージ＆味方HP回復
    - cost=5 / hit_count=50 / value=6.5 / additional_value=0.0
  - innate skills (4):
    - Attack Multiply ×1.74232 — 火属性の魔剣の攻撃力が絶大にアップ【熟度UPにつれてさらに効果値UP】
    - Random_Attack Multiply ×1.5 — 一定の割合で大ダメージが発動
    - Vitality_Attack Multiply ×2.25 — 残HPが多いほど攻撃力が絶大にアップ
    - DamageLimitBreak Addition **+500000000.0 → +1000000000.0** — **火属性の魔剣のダメージ上限が5億アップ → 火属性の魔剣のダメージ上限が10億アップ**
- [`151102`](weapons.json#L206464) エクセルシヌス=メアリー【極】
  - base_name: エクセルシヌス=メアリー (costume: 極魔装)
  - element=火(1) / type=大鎌(12) / rarity=SS(4) / cv=高柳知葉
  - max stats: HP=7800 / ATK=35100 / DEF=14300 / SPD=25 / BREAK=1040
  - hit_counts=[3, 4, 11] (3段)  motion_speed=[2.0/2.0/1.2]  mp=1000
  - three_size=74/59/76 / initial_slot=4
  - BD: 遍くを喰らえ偽証の晩餐 (arts_id=511)
    - description: 敵全体に超絶強力な50連ダメージ＆味方HP回復
    - cost=5 / hit_count=50 / value=6.5 / additional_value=0.0
  - innate skills (4):
    - Attack Multiply ×2.0 — 火属性の魔剣の攻撃力が超絶大アップ【熟度UPにつれてさらに効果値UP】
    - Random_Attack Multiply ×1.5 — かなりの割合で大ダメージが発動
    - Vitality_Attack Multiply ×2.55 — 残HPが多いほど攻撃力が超絶大にアップ
    - DamageLimitBreak Addition **+500000000.0 → +1000000000.0** — **火属性の魔剣のダメージ上限が5億アップ → 火属性の魔剣のダメージ上限が10億アップ**
- [`158001`](weapons.json#L237404) 戦闘距離拡大戦略
  - base_name: 戦闘距離拡大戦略 (costume: 魔装)
  - element=闇(5) / type=投擲(9) / rarity=S(3) / cv=北島瑞月
  - max stats: HP=7890 / ATK=1230 / DEF=7890 / SPD=24 / BREAK=890
  - hit_counts=[8, 9, 10] (3段)  motion_speed=[2.0/2.0/1.1]  mp=234
  - three_size=69/54/70 / **initial_slot=2 → 3**
  - BD: 絶対安全★セパレートシャッター (arts_id=580)
    - description: 敵全体に超強力な45連ダメージ＆wave中、防御力20%UP
    - cost=4 / hit_count=45 / value=1.72 / additional_value=0.0
  - innate skills (2):
    - AllTarget Multiply ×0.8 — 攻撃力はやや下がるが自分の攻撃範囲が敵全体になる
    - **新增: Attack Multiply ×1.25 — 闇属性の魔剣の攻撃力がかなりアップ**
- [`158002`](weapons.json#L237561) 戦闘距離拡大戦略【極】
  - base_name: 戦闘距離拡大戦略 (costume: 極魔装)
  - element=闇(5) / type=投擲(9) / rarity=S(3) / cv=北島瑞月
  - max stats: HP=10260 / ATK=1600 / DEF=10260 / SPD=24 / BREAK=1160
  - hit_counts=[9, 9, 13] (3段)  motion_speed=[2.0/2.0/1.1]  mp=234
  - three_size=69/54/70 / **initial_slot=3 → 4**
  - BD: 絶対安全★セパレートシャッター (arts_id=580)
    - description: 敵全体に超強力な45連ダメージ＆wave中、防御力20%UP
    - cost=4 / hit_count=45 / value=1.72 / additional_value=0.0
  - innate skills (8):
    - AllTarget Multiply ×1.0 — 攻撃力を下げずに自分の攻撃範囲が敵全体になる
    - **新增: Attack Multiply ×1.5 — 闇属性の魔剣の攻撃力が大幅にアップ**
    - **新增: InstantDeath Repel_Percent ×50.0 — 編成魔剣全体が即死特性の攻撃を確率で回避する**
    - **新增: BlazeAbsorb Repel_Percent ×50.0 — 編成魔剣全体が勇気分解の発生を確率で回避する**
    - **新增: Stun Repel_Percent ×50.0 — 編成魔剣全体がスタンの発生を確率で回避する**
    - **新增: Mez Repel_Percent ×50.0 — 編成魔剣全体が麻痺の発生を確率で回避する**
    - **新增: RateDamage Repel_Percent ×50.0 — 編成魔剣全体が割合ダメージ攻撃を確率で回避する**
    - **新增: DamageLimitBreak Addition +500000000.0 — 自身のダメージ上限が5億アップ**
- [`160201`](weapons.json#L245743) 聖邪剣クラレント:Blaze
  - base_name: 聖邪剣クラレント:Blaze (costume: 魔装)
  - element=光(4) / type=大剣(2) / rarity=SS(4) / cv=長江里加
  - max stats: HP=17690 / ATK=22000 / DEF=6150 / SPD=28 / BREAK=5800
  - hit_counts=[3, 5, 9] (3段)  motion_speed=[2.0/2.0/1.0]  mp=1300
  - three_size=100/63/82 / initial_slot=3
  - BD: EVIL BLAZE《凱旋せし仇約の煌》 (arts_id=602)
    - description: 敵全体に消費ゲージ数に応じた100連ダメージ＆20秒間ﾓｰｼｮﾝ速度2倍＆敵を強制ブレイク
    - cost=5 / hit_count=100 / value=0.9 / additional_value=20.0
  - innate skills (4):
    - WeaponArtsCost Addition +0.0 — 自身のB.D.レベル上限が絶大に上昇
    - DamageLimitBreak Addition **+1000000000.0 → +1500000000.0** — **自身のダメージ上限が10億アップ【熟度UPにつれてさらに効果値がUP】 → 自身のダメージ上限が15億アップ【熟度UPにつれてさらに効果値がUP】**
    - Vitality_Attack Multiply ×3.0 — 残HPが多いほど攻撃力がアップ(最大3倍)
    - Enemy_BreakAttack Multiply ×7.0 — ブレイク時に自身の攻撃力が7倍アップ
- [`160202`](weapons.json#L245950) 聖邪剣クラレント:Blaze【極】
  - base_name: 聖邪剣クラレント:Blaze (costume: 極魔装)
  - element=光(4) / type=大剣(2) / rarity=SS(4) / cv=長江里加
  - max stats: HP=23000 / ATK=28600 / DEF=8000 / SPD=28 / BREAK=7540
  - hit_counts=[4, 5, 12] (3段)  motion_speed=[2.0/2.0/1.0]  mp=1300
  - three_size=100/63/82 / initial_slot=4
  - BD: EVIL BLAZE《凱旋せし仇約の煌》 (arts_id=602)
    - description: 敵全体に消費ゲージ数に応じた100連ダメージ＆20秒間ﾓｰｼｮﾝ速度2倍＆敵を強制ブレイク
    - cost=5 / hit_count=100 / value=0.9 / additional_value=20.0
  - innate skills (4):
    - WeaponArtsCost Addition +0.0 — 自身のB.D.レベル上限が絶大に上昇
    - DamageLimitBreak Addition **+1000000000.0 → +1500000000.0** — **自身のダメージ上限が10億アップ【熟度UPにつれてさらに効果値がUP】 → 自身のダメージ上限が15億アップ【熟度UPにつれてさらに効果値がUP】**
    - Vitality_Attack Multiply ×3.0 — 残HPが多いほど攻撃力がアップ(最大3倍)
    - Enemy_BreakAttack Multiply ×7.0 — ブレイク時に自身の攻撃力が7倍アップ
- [`162901`](weapons.json#L254985) キャバリア
  - base_name: キャバリア (costume: 魔装)
  - element=風(3) / type=騎槍(8) / rarity=S(3) / cv=鈴代紗弓
  - max stats: HP=15540 / ATK=5410 / DEF=9850 / SPD=20 / BREAK=270
  - hit_counts=[5, 3, 8] (3段)  motion_speed=[2.0/2.2/1.2]  mp=250
  - three_size=71/55/75 / initial_slot=2
  - BD: ナイトオブオビディエンス (arts_id=629)
    - description: 敵全体に消費ゲージ数に応じた1連ダメージ＆数秒間防御力3倍
    - cost=1 / hit_count=1 / value=0.1 / additional_value=700.0
  - innate skills (3):
    - BlazeAbsorb Repel_Percent ×100.0 — 編成魔剣全体が勇気分解を完全回避
    - Vitality_Speed Multiply ×3.0 — 風属性の味方全体が、残HPが多いほどスピードがアップ(最大3倍)
    - **新增: Vitality_Attack Multiply ×1.4 — 風属性の味方全体が、残HPが多いほど攻撃力がかなりアップ**
- [`162902`](weapons.json#L255161) キャバリア【極】
  - base_name: キャバリア (costume: 極魔装)
  - element=風(3) / type=騎槍(8) / rarity=S(3) / cv=鈴代紗弓
  - max stats: HP=20200 / ATK=7030 / DEF=12800 / SPD=20 / BREAK=350
  - hit_counts=[6, 3, 11] (3段)  motion_speed=[2.0/2.2/1.2]  mp=250
  - three_size=71/55/75 / initial_slot=3
  - BD: ナイトオブオビディエンス (arts_id=629)
    - description: 敵全体に消費ゲージ数に応じた1連ダメージ＆数秒間防御力3倍
    - cost=1 / hit_count=1 / value=0.1 / additional_value=700.0
  - innate skills (3):
    - BlazeAbsorb Repel_Percent ×100.0 — 編成魔剣全体が勇気分解を完全回避
    - Vitality_Speed Multiply ×3.0 — 風属性の味方全体が、残HPが多いほどスピードがアップ(最大3倍)
    - **新增: Vitality_Attack Multiply ×1.7469 — 風属性の味方全体が、残HPが多いほど攻撃力が大幅にアップ【熟度UPにつれてさらに効果値UP】**

## weapon_costumes

### 新增 (3)

- [`1594049`](weapon_costumes.json#L29804) 魔装《暗躍》
  - 归属武器: マタゴット=ノラ (weapon_base_id=1594)
  - effects: SapphireDrop Multiply ×1.13
- [`1597049`](weapon_costumes.json#L29845) 魔装《暗躍》
  - 归属武器: 清香のカモミール (weapon_base_id=1597)
  - effects: MotionSpeed Multiply ×1.13
- [`1602049`](weapon_costumes.json#L30180) 魔装《暗躍》
  - 归属武器: 聖邪剣クラレント:Blaze (weapon_base_id=1602)
  - effects: MotionSpeed Multiply ×1.13

## materials

### 新增 (1)

- [`32140101`](materials.json#L10517) 嵐魔神の律動Lv3 rarity=3
  - 結晶化した魔剣の記憶。[風のみ]
[残HPが多いほど攻撃力がUP][上限値:高]

## items

### 新增 (5)

- [`15354`](items.json#L33445) スタージュエル
  - 膨大な魔力から偶然精製された
稀少鉱石。ダイヤに似た別物。
- [`40842`](items.json#L128953) 【期間限定】真式･超強化の鍵α
  - 9月25日16時までショップで特定魔剣の熟度をあげられる鍵。
- [`1594049`](items.json#L162799) マタゴット=ノラの暗躍グラス
  - マタゴット=ノラの新たな力を
引き出すことができる魔術礼装。
- [`1597049`](items.json#L162817) 清香のカモミールの暗躍衣装
  - 清香のカモミールの新たな力を
引き出すことができる魔術礼装。
- [`1602049`](items.json#L162943) 聖邪剣クラレント:Blazeの暗躍衣装
  - 聖邪剣クラレント:Blazeの新たな力を
引き出すことができる魔術礼装。

### 删除 (1)

- [`6283`](../2026_09_08_00_00_00/items.json#L7187) Blaze魔剣交換チケット

---

★ 跳过的 derived 表(非 local-master.dat 产物,需 server response 聚合):
- `memory_slot_skills.json`
- `npc_motions.json`
