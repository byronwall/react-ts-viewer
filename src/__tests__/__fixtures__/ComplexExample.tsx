import React, {
  useState,
  useMemo,
  createContext,
  useContext,
  Suspense,
} from "react";

const MyContext = createContext<string | null>(null);

// Another component in the same file
const InnerComponent = React.memo(({ text }: { text: string }) => {
  const contextValue = useContext(MyContext);
  return (
    <p>
      Inner: {text} (Context: {contextValue})
    </p>
  );
});

export class ClassComponentExample extends React.Component<
  { title: string },
  { value: number }
> {
  constructor(props: { title: string }) {
    super(props);
    this.state = { value: 0 };
    this.increment = this.increment.bind(this); // binding 'this'
  }

  increment() {
    this.setState((prev) => ({ value: prev.value + 1 }));
  }

  render() {
    const { title } = this.props;
    const { value } = this.state;
    return (
      <section>
        <h3>{title} - Class Component</h3>
        <p>Value: {value}</p>
        <button onClick={this.increment}>Increment Class</button>
      </section>
    );
  }
}

// Lazy loaded component
const LazyComponent = React.lazy(() => import("./AdvancedComponent")); // Assume AdvancedComponent is default export

function ComplexExample({ theme }: { theme: string }) {
  const [data, setData] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async (filter: string) => {
    setIsLoading(true);
    // Mock API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setData([`item1-${filter}`, `item2-${filter}`]);
    setIsLoading(false);
  };

  useMemo(() => {
    // Some expensive calculation based on theme
    console.log("Theme changed:", theme);
    fetchData(theme);
  }, [theme]);

  if (isLoading) {
    return <div>Loading data for {theme}...</div>;
  }

  const renderItem = (item: string, index: number) => {
    // A render prop style function inside the component
    return <li key={index}>{item.toUpperCase()}</li>;
  };

  return (
    <MyContext.Provider value={theme}>
      <article className={`theme-${theme}`}>
        <h1>Complex Example</h1>
        <InnerComponent text="Hello from complex" />
        <ul>{data.map(renderItem)}</ul>
        <ClassComponentExample title="My Class Section" />
        <Suspense fallback={<div>Loading lazy component...</div>}>
          <LazyComponent id="lazy-1" />
        </Suspense>
      </article>
    </MyContext.Provider>
  );
}

export default ComplexExample;
