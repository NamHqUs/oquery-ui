import { configureStore } from "@reduxjs/toolkit";
import dataSourceReducer from "../components/data-sources/data-source-slice";
import databaseReducer from "../components/data-sources/database-slice";
import functionDefinitionsReducer from "../components/function-definition/function-definition-slice";
import metadataReducer from "../components/metadata/metadata-slice";
import playgroundReducer from "../components/playground/playground-slice";
import savedQueriesReducer from "../components/saved-queries/saved-queries-slice";

export const store = configureStore({
  reducer: {
    dataSource: dataSourceReducer,
    database: databaseReducer,
    metadata: metadataReducer,
    functionDefinitions: functionDefinitionsReducer,
    savedQueries: savedQueriesReducer,
    playground: playgroundReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
