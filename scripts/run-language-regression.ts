import { fallbackRuleBasedParser } from '../src/services/aiService.ts';

const cases: Array<{ name: string; input: string; expectedType: string; expectedPlace?: string; currentJourney?: any }> = [
  { name: 'Hindi Devanagari destination', input: 'मुझे आगरा जाना है।', expectedType: 'SET_DESTINATION', expectedPlace: 'आगरा' },
  { name: 'Hindi stop addition', input: 'बीच में मथुरा पर स्टॉप जोड़ दो', expectedType: 'ADD_STOP', expectedPlace: 'मथुरा', currentJourney: { destination: { name: 'Agra' }, stops: [] } },
  { name: 'Hinglish stop preserves destination intent', input: 'Destination same rakhna, Mathura stop add karo', expectedType: 'ADD_STOP', expectedPlace: 'Mathura', currentJourney: { destination: { name: 'Agra' }, stops: [] } },
  { name: 'English command', input: 'Take me to Agra', expectedType: 'SET_DESTINATION', expectedPlace: 'Agra' },
  { name: 'Marathi destination', input: 'मला पुण्याला जायचे आहे', expectedType: 'SET_DESTINATION', expectedPlace: 'पुणे' },
  { name: 'Current location is a location action', input: 'Show my current location', expectedType: 'REQUEST_CURRENT_LOCATION' },
  { name: 'Translation does not execute navigation', input: 'Translate "मुझे आगरा जाना है" into English', expectedType: 'NO_NAVIGATION' },
];

let failed = 0;
for (const test of cases) {
  const result = fallbackRuleBasedParser(test.input, test.currentJourney || { destination: null, stops: [] }, 'en');
  const first = result.actions[0];
  const typeOk = test.expectedType === 'NO_NAVIGATION' ? result.actions.length === 0 && result.intent === 'translate' : first?.type === test.expectedType;
  const placeOk = !test.expectedPlace || first?.placeQuery === test.expectedPlace;
  const ok = typeOk && placeOk;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${test.name}${ok ? '' : ` (got ${first?.type || result.intent}${first?.placeQuery ? `: ${first.placeQuery}` : ''})`}`);
  if (!ok) failed++;
}
if (failed) process.exitCode = 1;
else console.log(`All ${cases.length} local language regression tests passed.`);
