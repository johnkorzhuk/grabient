import { applyMiddleware, compose, createStore } from 'redux'
import thunk from 'redux-thunk'
import rootReducer from './reducers'

let middleware = [thunk]

// import { applyMiddleware, compose, createStore } from 'redux'
// import logger from 'redux-logger'
// import thunk from 'redux-thunk'
// import rootReducer from './reducers'

// let middleware = [thunk]

// if (process.env.NODE_ENV !== 'production') {
//   middleware = [...middleware, logger]
// }

const enhancers = compose(
  applyMiddleware(...middleware),
  window.devToolsExtension && process.env.NODE_ENV !== 'production'
    ? window.devToolsExtension()
    : f => f
)

const store = createStore(rootReducer, undefined, enhancers)

export default store
