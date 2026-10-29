import "@papit/codeblock";
import '@papchat/badge';

const created = document.getElementById("created");

const counted = document.createElement("pc-badge");
counted.variant = "primary";
counted.count = 12;
created.append(counted);

const labelled = document.createElement("pc-badge");
labelled.variant = "live";
labelled.textContent = "Live";
created.append(labelled);
