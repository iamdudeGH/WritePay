const Address = "0xe9bc5063f3bd7559844b6231f25f02baee278ce1c1776b43befc26688d95910e";
fetch(`https://api.testnet.aptoslabs.com/v1/accounts/${Address}/transactions?limit=5`)
.then(x => x.json())
.then(data => {
    data.forEach(tx => {
        console.log(`\n--- Tx Version ${tx.version} ---`);
        if (tx.payload) console.log(`Function: ${tx.payload.function}`);
        if (tx.events) {
            tx.events.forEach(ev => {
                if (ev.type.includes("Article")) {
                    console.log(`Event Type: ${ev.type}`);
                    console.log(`Event Data:`, ev.data);
                }
            });
        }
    });
})
