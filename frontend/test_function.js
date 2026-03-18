fetch(`https://api.testnet.aptoslabs.com/v1/graphql`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
query: `query {
  user_transactions(
    where: { entry_function_id_str: { _eq: "0x41c3da9bb76099d3d6c53b206b944e30caba8d52f978678d376543f9f1590832::ArticleManagement::delete_article" } }
    order_by: { version: desc }
    limit: 5
  ) {
    version
    hash
    success
  }
}`
})
})
.then(x => x.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
