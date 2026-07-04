function buildHafizSequence(ayahList) {
  const sequence = [];
  for (let i = 0; i < ayahList.length; i++) {
    const { surah, ayah } = ayahList[i];
    for (let repeat = 0; repeat < 3; repeat++) {
      sequence.push({ surah, ayah });
    }
    if (i > 0) {
      for (let j = 0; j <= i; j++) {
        sequence.push({ surah: ayahList[j].surah, ayah: ayahList[j].ayah });
      }
    }
  }
  return sequence;
}

module.exports = { buildHafizSequence };
