import SearchApp from './components/app/SearchApp';
import './App.css';
export default function App() {
  return (
    <div className="app-root">
      {}
      <a href="#main-content" className="skip-nav">
        Skip to main content
      </a>
      {}
      <SearchApp />
    </div>
  );
}
