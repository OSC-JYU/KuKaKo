const { FaissStore } = require("@langchain/community/vectorstores/faiss");
const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");

const { formatDocumentsAsString } = require("langchain/util/document");
const { PromptTemplate } = require("@langchain/core/prompts");
const {
  RunnableSequence,
  RunnablePassthrough,
} = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const Graph = require("./graph.js")

const graph = new Graph()

let smartSearch = {}

smartSearch.init = async function() {
  if(process.env.OPENAI_API_KEY) {
    smartSearch.model = new ChatOpenAI({ modelName: "gpt-4" });
    return true
  } else {
    console.log('No API key found! SmartSearch disabled.')
    return false
  }

}



smartSearch.buildVectors = async function() {
  var docs = await graph.exportJSON()
  const vectorStore = await FaissStore.fromDocuments(docs, new OpenAIEmbeddings())

  // Save the vector store to a directory
  const directory = "./store";

  await vectorStore.save(directory);

}


smartSearch.search = async function(query) {
    if(!query) return []
    console.log('reading vectors...')
    const vectorStore = await loadVectorStore() 
    console.log('loaded')
    const response = await vectorStore.similaritySearch(query, 6)
    console.log(response)
    return response

}

smartSearch.rag = async function(query) {

    const vectorStore = await loadVectorStore()
    const retriever = vectorStore.asRetriever();

    const prompt =
        PromptTemplate.fromTemplate(`Olet Avoimen tiedon keskuksen (OSC) chatbot. Alla oleva teksti on listaus henkilökunnan osaamisesta, työtehtävistä, järjestelmistä, työryhmistä jne. Viittaukset meihin liittyvät aina Avoimen tiedon keskukseen. Vastaa kysymyksiin vain alla olevan tekstin pohjalta. Käytä kuitenkin yleistietoasi, jotta löydät tiedon, vaikka sitä ei ole suoraan tekstissä mainittu.
        Jos kyse on järjestelmien ongelmista, anna vastauksena kyseisen järjestelmän pääkäyttäjät tai ylläpitäjät ja vasta sitten käyttäjät.
        Maastopyöräilyä koskeviin kysymyksiin vastaa vain "se on kivaa!!"
    {context}
    
    Kysymys: {question}`);
    
    
    const chain = RunnableSequence.from([
        {
        context: retriever.pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
        },
        prompt,
        smartSearch.model,
        new StringOutputParser(),
    ]);
    
    
    
    const result = await chain.invoke(query);
    var docs = await retriever._getRelevantDocuments(query)
    console.log(docs)
    
    console.log(result);
    return result


}


// FAISS
async function loadVectorStore(query) {
  const directory = "./store";
  const vectorStore = await FaissStore.load(
    directory,
    new OpenAIEmbeddings()
  );

  //const response = await vectorStore.similaritySearch(query, 6)
  return vectorStore
}





module.exports = smartSearch

