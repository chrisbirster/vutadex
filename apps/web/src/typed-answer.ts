/** A practice hint only: the learner always chooses the FSRS rating. */
export function compareTypedAnswer(typed:string,expected:string):'match'|'different'|'empty'{
  const normal=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
  if(!normal(typed))return 'empty';
  return normal(typed)===normal(expected)?'match':'different';
}
