import "@papit/codeblock";
import '@papchat/presence';

const created = document.getElementById("created");
for (const status of ["available", "busy", "away", "dnd", "offline"])
{
    const presence = document.createElement("pc-presence");
    presence.status = status;
    created.append(presence);
}
