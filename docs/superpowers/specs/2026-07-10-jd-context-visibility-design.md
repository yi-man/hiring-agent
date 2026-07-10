# JD Context Visibility Design

**Goal:** Let users inspect the exact company knowledge context used to create a JD and make the selection rules explicit.

**Design:** Add a JD context API and page at `/jd-generator/[id]/context`. The page reads the JD generation metadata, shows the retrieval query, selected chunks, scores, document names, content snippets, and the rule summary. New JD generations store selected chunk text plus selection policy in `generationMeta.context`; older JDs hydrate missing text from the current knowledge chunks by `chunkId`.

**Selection Rules:** Retrieve 12 candidate chunks, then select at most 6 chunks from at most 3 documents, with at most 3 chunks per document. Drop chunks below `RAG_MIN_SCORE`, skip adjacent or highly overlapping chunks from the same document, and keep the total prompt context under `RAG_CONTEXT_MAX_CHARS`.

**Links:** JD detail and create-run execution pages link to the context page when a JD id is available. The context page also links back to JD detail and to the knowledge library.
