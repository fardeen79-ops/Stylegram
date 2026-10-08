import { describe, expect, it } from "vitest";
import { setup } from "./helpers.js";

describe("paid partnership label", () => {
  it("is shown as soon as the creator declares it; the brand confirms or declines; the creator can edit it", async () => {
    const { user, brand, post } = setup();
    const admin = await user("admin");
    const saffron = await brand("saffronsand", "Saffron & Sand", admin);
    const other = await brand("otherbrand", "Other Brand", admin);
    const noor = await user("noor");

    // Declared at upload time, by brand slug.
    const created = await post(noor).field("partner", JSON.stringify({ brandSlug: "saffron-and-sand" })).expect(201);
    expect(created.body.partnership).toMatchObject({ status: "PENDING", brand: { slug: "saffron-and-sand", name: "Saffron & Sand" } });
    const id = created.body.id;

    // Visible to everyone straight away, logged out too.
    expect((await noor.get(`/api/posts/${id}`)).body.partnership.status).toBe("PENDING");

    // The brand sees it and confirms; another brand can't touch it.
    const list = (await saffron.get("/api/brand/partnerships").expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ postId: id, author: "noor", status: "PENDING" })]);
    await other.post(`/api/brand/partnerships/${id}/review`).send({ action: "CONFIRM" }).expect(404);
    await saffron.post(`/api/brand/partnerships/${id}/review`).send({ action: "CONFIRM" }).expect(204);
    expect((await noor.get(`/api/posts/${id}`)).body.partnership).toMatchObject({ status: "CONFIRMED", brand: { name: "Saffron & Sand" } });

    // Declining removes the brand's name but keeps the post labelled as paid.
    await saffron.post(`/api/brand/partnerships/${id}/review`).send({ action: "DECLINE" }).expect(204);
    expect((await noor.get(`/api/posts/${id}`)).body.partnership).toEqual({ status: "DECLINED", brand: null });

    // The creator changes it to a new community brand by name (back to pending), then removes it.
    const changed = await noor.patch(`/api/posts/${id}`).send({ partner: { brandName: "Marina Optics" } }).expect(200);
    expect(changed.body.partnership).toMatchObject({ status: "PENDING", brand: { name: "Marina Optics" } });
    const removed = await noor.patch(`/api/posts/${id}`).send({ partner: null }).expect(200);
    expect(removed.body.partnership).toBeNull();
    expect(removed.body.caption).toBe("OOTD");

    // Only the author can edit it.
    const omar = await user("omar");
    await omar.patch(`/api/posts/${id}`).send({ partner: { brandSlug: "saffron-and-sand" } }).expect(403);
  });

  it("rejects labelling your own brand, unknown brands and empty updates; personal accounts have no partnership list", async () => {
    const { user, brand, post } = setup();
    const admin = await user("admin");
    const saffron = await brand("saffronsand", "Saffron & Sand", admin);
    const noor = await user("noor");
    await post(saffron).field("partner", JSON.stringify({ brandSlug: "saffron-and-sand" })).expect(400);
    await post(noor).field("partner", JSON.stringify({ brandSlug: "no-such-brand" })).expect(400);
    await post(noor).field("partner", JSON.stringify({})).expect(400);
    const plain = await post(noor).expect(201);
    expect(plain.body.partnership).toBeNull();
    await noor.patch(`/api/posts/${plain.body.id}`).send({}).expect(400);
    await noor.get("/api/brand/partnerships").expect(403);
  });
});
