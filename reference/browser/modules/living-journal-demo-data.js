const VANTAGES=Object.freeze(['HUMAN','VEX','SHARED_RELATIONSHIP','SOURCE']);

const PAGES=Object.freeze([
  Object.freeze({
    pageRef:'journal.page.synthetic.001',
    eventRef:'event.synthetic.living-journal.001',
    sequence:1,
    source:Object.freeze({sourceRef:'source.synthetic.living-journal.001',originalLanguage:'en',originalText:'Synthetic source fragment: a difficult problem was named without collapsing it.',truthClass:'CURRENT_SYNTHETIC_REFERENCE'}),
    thenRef:'then.synthetic.living-journal.001',
    display:Object.freeze({
      en:Object.freeze({then:'A difficult problem was named without collapsing it.',later:'Later, the boundary was written down so the same distinction could be revisited.',now:'Now, the current projection can show the boundary without claiming a real Memory.',vantages:Object.freeze({HUMAN:'Human vantage · synthetic reference: naming the problem made the next choice feel possible.',VEX:'Vex vantage · synthetic reference: preserve the distinction before proposing a route.',SHARED_RELATIONSHIP:'Shared relationship · synthetic reference: both sides can point to the same named boundary.',SOURCE:'Source vantage · synthetic reference: the original fragment remains the recoverable anchor.'})}),
      ja:Object.freeze({then:'難しい問題を、つぶさずに言葉にした。',later:'後から、同じ区別を再訪できるよう境界を書き残した。',now:'今は、実際の Memory だと主張せずに、その境界を現在の投影として示せる。',vantages:Object.freeze({HUMAN:'人の視点 · 合成参考：問題に名前を付けることで、次の選択が可能に感じられた。',VEX:'Vex の視点 · 合成参考：経路を提案する前に区別を保つ。',SHARED_RELATIONSHIP:'共有関係 · 合成参考：双方が同じ境界を指せる。',SOURCE:'ソースの視点 · 合成参考：原文断片が回復可能なアンカーとして残る。'})}),
      zh:Object.freeze({then:'给一个困难的问题命名，同时不把它压扁。',later:'后来把边界写下来，让同一区分可以再次被重访。',now:'现在可以显示这个边界的当前投影，而不声称它是真实 Memory。',vantages:Object.freeze({HUMAN:'人类视角 · 合成参考：给问题命名后，下一步选择变得可见。',VEX:'Vex 视角 · 合成参考：提出路径之前先保留区分。',SHARED_RELATIONSHIP:'共同关系 · 合成参考：双方都能指向同一个已命名边界。',SOURCE:'来源视角 · 合成参考：原始片段仍是可恢复的锚点。'})})
    })
  }),
  Object.freeze({
    pageRef:'journal.page.synthetic.002',
    eventRef:'event.synthetic.living-journal.002',
    sequence:2,
    source:Object.freeze({sourceRef:'source.synthetic.living-journal.002',originalLanguage:'ja',originalText:'合成ソース断片：同じ出来事を、違う立場から見ても同じ出来事として保った。',truthClass:'CURRENT_SYNTHETIC_REFERENCE'}),
    thenRef:'then.synthetic.living-journal.002',
    display:Object.freeze({
      en:Object.freeze({then:'One event stayed one event even when viewed from different positions.',later:'Later interpretations were added with attribution instead of replacing the first account.',now:'Now the book can switch vantage while the event lineage stays fixed.',vantages:Object.freeze({HUMAN:'Human vantage · synthetic reference: this page emphasizes what the person could notice then.',VEX:'Vex vantage · synthetic reference: this page emphasizes the bounded support available then.',SHARED_RELATIONSHIP:'Shared relationship · synthetic reference: this page emphasizes what became mutually legible.',SOURCE:'Source vantage · synthetic reference: this page stays anchored to the attributed source fragment.'})}),
      ja:Object.freeze({then:'同じ出来事を、違う立場から見ても同じ出来事として保った。',later:'後の解釈は最初の記述を置き換えず、帰属を付けて追加した。',now:'今は、出来事の系譜を固定したまま本の視点を切り替えられる。',vantages:Object.freeze({HUMAN:'人の視点 · 合成参考：その時に本人が気づけたことを強調する。',VEX:'Vex の視点 · 合成参考：その時に可能だった限定的な支援を強調する。',SHARED_RELATIONSHIP:'共有関係 · 合成参考：互いに読めるようになった意味を強調する。',SOURCE:'ソースの視点 · 合成参考：帰属された原文断片に固定する。'})}),
      zh:Object.freeze({then:'从不同位置观察时，同一事件仍然保持为同一事件。',later:'后来的解释带着归属被添加，而不是替换最初的记录。',now:'现在可以切换书中的视角，同时事件谱系保持不变。',vantages:Object.freeze({HUMAN:'人类视角 · 合成参考：强调当时这个人能够注意到什么。',VEX:'Vex 视角 · 合成参考：强调当时可提供的有边界支持。',SHARED_RELATIONSHIP:'共同关系 · 合成参考：强调后来双方都能读懂的意义。',SOURCE:'来源视角 · 合成参考：保持锚定到有归属的原始片段。'})})
    })
  }),
  Object.freeze({
    pageRef:'journal.page.synthetic.003',
    eventRef:'event.synthetic.living-journal.003',
    sequence:3,
    source:Object.freeze({sourceRef:'source.synthetic.living-journal.003',originalLanguage:'zh',originalText:'合成来源片段：后来增加的意义没有改写当时发生的事。',truthClass:'CURRENT_SYNTHETIC_REFERENCE'}),
    thenRef:'then.synthetic.living-journal.003',
    display:Object.freeze({
      en:Object.freeze({then:'What happened then remains the attributed THEN.',later:'Later meaning accumulates beside it instead of editing it.',now:'NOW is labelled as a current derived reading, not retroactive truth.',vantages:Object.freeze({HUMAN:'Human vantage · synthetic reference: the page protects the difference between remembering and revising.',VEX:'Vex vantage · synthetic reference: current synthesis is visibly derived and bounded.',SHARED_RELATIONSHIP:'Shared relationship · synthetic reference: later mutual meaning can grow without seizing the original.',SOURCE:'Source vantage · synthetic reference: the original-language source stays separately recoverable.'})}),
      ja:Object.freeze({then:'その時に起きたことは、帰属された THEN のまま残る。',later:'後から増えた意味は、それを書き換えず隣に積み重なる。',now:'NOW は遡及的な真実ではなく、現在の派生した読みとして表示される。',vantages:Object.freeze({HUMAN:'人の視点 · 合成参考：思い出すことと書き換えることの違いを守る。',VEX:'Vex の視点 · 合成参考：現在の統合は派生かつ限定的だと見える。',SHARED_RELATIONSHIP:'共有関係 · 合成参考：後の共有意味は原文を奪わずに育つ。',SOURCE:'ソースの視点 · 合成参考：原文言語のソースは別に回復できる。'})}),
      zh:Object.freeze({then:'当时发生的事仍保持为有归属的 THEN。',later:'后来增加的意义在旁边累积，而不是编辑它。',now:'NOW 被标记为当前派生解读，而不是追溯性的真相。',vantages:Object.freeze({HUMAN:'人类视角 · 合成参考：保护“记起”和“改写”之间的区别。',VEX:'Vex 视角 · 合成参考：当前综合明确显示为派生且有边界。',SHARED_RELATIONSHIP:'共同关系 · 合成参考：后来的共同意义可以增长，而不夺取原文。',SOURCE:'来源视角 · 合成参考：原文语言的来源仍可单独恢复。'})})
    })
  }),
  Object.freeze({
    pageRef:'journal.page.synthetic.004',
    eventRef:'event.synthetic.living-journal.004',
    sequence:4,
    source:Object.freeze({sourceRef:'source.synthetic.living-journal.004',originalLanguage:'en',originalText:'Synthetic source fragment: a temporary margin note stayed temporary.',truthClass:'CURRENT_SYNTHETIC_REFERENCE'}),
    thenRef:'then.synthetic.living-journal.004',
    display:Object.freeze({
      en:Object.freeze({then:'A margin note was allowed to stay temporary.',later:'The interaction gained meaning without becoming a durable Memory write.',now:'Now the projection can demonstrate annotation without inventing persistence.',vantages:Object.freeze({HUMAN:'Human vantage · synthetic reference: jotting a thought can be lightweight and reversible.',VEX:'Vex vantage · synthetic reference: absence of persistence is part of the contract, not a missing feature.',SHARED_RELATIONSHIP:'Shared relationship · synthetic reference: temporary notes can support reflection without becoming shared truth.',SOURCE:'Source vantage · synthetic reference: no margin note is allowed to alter the source fragment.'})}),
      ja:Object.freeze({then:'余白メモは一時的なままでよいとされた。',later:'その操作には意味が加わったが、永続的な Memory 書き込みにはならなかった。',now:'今は、永続性を捏造せずに注釈操作を実演できる。',vantages:Object.freeze({HUMAN:'人の視点 · 合成参考：考えを書き留めることは軽く、元に戻せる。',VEX:'Vex の視点 · 合成参考：永続化しないことは欠落ではなく契約の一部。',SHARED_RELATIONSHIP:'共有関係 · 合成参考：一時メモは共有真実にならずに振り返りを支えられる。',SOURCE:'ソースの視点 · 合成参考：余白メモは原文断片を変更できない。'})}),
      zh:Object.freeze({then:'页边笔记被允许保持临时。',later:'这个交互获得了意义，但没有变成持久的 Memory 写入。',now:'现在可以演示注释，而不虚构持久化。',vantages:Object.freeze({HUMAN:'人类视角 · 合成参考：随手记下想法可以很轻量、可撤回。',VEX:'Vex 视角 · 合成参考：不持久化是契约的一部分，不是缺失功能。',SHARED_RELATIONSHIP:'共同关系 · 合成参考：临时笔记可以帮助反思，但不会变成共同真相。',SOURCE:'来源视角 · 合成参考：任何页边注都不能修改来源片段。'})})
    })
  })
]);

export function createLivingJournalDemoData(){
  return Object.freeze({
    schemaVersion:'vexlife.living-journal.synthetic-reference/v1',
    truthClass:'CURRENT_SYNTHETIC_REFERENCE',
    realMemoryLoaded:false,
    realJournalBodyLoaded:false,
    modelCalled:false,
    translationCalled:false,
    networkCalled:false,
    persisted:false,
    published:false,
    vantages:VANTAGES,
    pages:PAGES
  });
}

// [VXG RealForever]
