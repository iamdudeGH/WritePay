fetch("https://api.testnet.aptoslabs.com/v1/graphql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: `
      query GetEvents {
        events(
          where: {
            account_address: { _eq: "0x41c3da9bb76099d3d6c53b206b944e30caba8d52f978678d376543f9f1590832" }
          }
          order_by: { transaction_version: desc }
          limit: 10
        ) {
          type
          data
          transaction_version
        }
      }
    `
  })
})
.then(res => res.json())
.then(console.log)
