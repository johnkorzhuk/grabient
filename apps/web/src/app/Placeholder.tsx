/** A page whose feature is still to come: its heading alone, so its address, language and head can be checked. */
export function Placeholder(props: { title: string }) {
  return (
    <main id="main">
      <h1>{props.title}</h1>
    </main>
  );
}
