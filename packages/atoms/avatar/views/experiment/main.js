import '@papchat/avatar';

const created = document.getElementById("created");
for (const name of ["Created One", "two", "Third Person Here"])
{
    const avatar = document.createElement("pc-avatar");
    avatar.name = name;
    avatar.uid = name;
    created.append(avatar);
}
