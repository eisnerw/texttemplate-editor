import * as TextTemplateTokensProvider from '../../main-generated/javascript/TextTemplateTokensProvider.js';
import * as parserFacade from '../../main-generated/javascript/ParserFacade.js';

if (typeof window === 'undefined') {

} else {
    window.TextTemplateTokensProvider = TextTemplateTokensProvider;
    window.ParserFacade = parserFacade;
}
